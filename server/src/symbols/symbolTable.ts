import { ParserRuleContext, TerminalNode, Token } from 'antlr4ng';
import { Range } from 'vscode-languageserver/node.js';
import { SysMLSymbol, SysMLElementKind } from './sysmlElements.js';
import { Scope } from './scope.js';
import { contextToRange, tokenToRange } from '../parser/positionUtils.js';
import { ParseResult } from '../parser/parseDocument.js';

/**
 * Builds a symbol table from a parsed SysML document.
 *
 * Walks the ANTLR parse tree to extract declarations, building
 * a hierarchical scope structure that mirrors the SysML namespace.
 */
export class SymbolTable {
    /** All symbols indexed by qualified name */
    private symbols = new Map<string, SysMLSymbol>();
    /** All symbols indexed by URI for cross-file lookup */
    private symbolsByUri = new Map<string, SysMLSymbol[]>();
    /** The global scope */
    private globalScope: Scope;

    constructor() {
        this.globalScope = new Scope('__global__');
    }

    /**
     * Build the symbol table from a parse result.
     */
    build(uri: string, parseResult: ParseResult): void {
        // Clear previous entries for this URI
        this.clearUri(uri);

        if (!parseResult.tree) {
            return;
        }

        // Walk the tree and collect symbols
        this.walkTree(parseResult.tree, uri, this.globalScope, '');
    }

    /**
     * Get a symbol by its qualified name.
     */
    getSymbol(qualifiedName: string): SysMLSymbol | undefined {
        return this.symbols.get(qualifiedName);
    }

    /**
     * Find a symbol by name (simple name, not qualified).
     */
    findByName(name: string): SysMLSymbol[] {
        const results: SysMLSymbol[] = [];
        for (const symbol of this.symbols.values()) {
            if (symbol.name === name) {
                results.push(symbol);
            }
        }
        return results;
    }

    /**
     * Resolve a symbol from document text at a given position.
     * First tries the declaration at that position, then falls back
     * to looking up the word (or quoted name) under the cursor.
     */
    resolveAt(
        uri: string,
        line: number,
        character: number,
        text: string,
    ): SysMLSymbol | undefined {
        // 1. Try direct declaration match
        const direct = this.findSymbolAtPosition(uri, line, character);
        if (direct) return direct;

        // 2. Fallback: resolve the word under the cursor as a reference
        const word = SymbolTable.getWordAtPosition(text, line, character);
        if (!word) return undefined;

        const matches = this.findByName(word);
        return matches.length > 0 ? matches[0] : undefined;
    }

    /**
     * Extract the word (identifier or quoted name) at a given position.
     * Handles both regular identifiers and SysML v2 unrestricted names
     * enclosed in single quotes (e.g., 'Drive Batmobile').
     */
    static getWordAtPosition(
        text: string,
        line: number,
        character: number,
    ): string | undefined {
        const lines = text.split('\n');
        if (line >= lines.length) return undefined;

        const lineText = lines[line];
        if (character >= lineText.length) return undefined;

        // First, check if the cursor is inside a quoted (unrestricted) name
        const quotePattern = /'([^']+)'/g;
        let qMatch: RegExpExecArray | null;
        while ((qMatch = quotePattern.exec(lineText)) !== null) {
            const start = qMatch.index;
            const end = start + qMatch[0].length;
            if (character >= start && character < end) {
                return qMatch[1]; // name without quotes
            }
        }

        // Regular identifiers
        const wordPattern = /[a-zA-Z_]\w*/g;
        let match: RegExpExecArray | null;
        while ((match = wordPattern.exec(lineText)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (character >= start && character <= end) {
                return match[0];
            }
        }

        return undefined;
    }

    /**
     * Find all symbols in a given URI.
     */
    getSymbolsForUri(uri: string): SysMLSymbol[] {
        return this.symbolsByUri.get(uri) ?? [];
    }

    /**
     * Get all symbols in the table.
     */
    getAllSymbols(): SysMLSymbol[] {
        return Array.from(this.symbols.values());
    }

    /**
     * Get the global scope for resolution.
     */
    getGlobalScope(): Scope {
        return this.globalScope;
    }

    /**
     * Find the symbol at a given position in a document.
     */
    findSymbolAtPosition(uri: string, line: number, character: number): SysMLSymbol | undefined {
        const symbols = this.getSymbolsForUri(uri);
        // Find the most specific (smallest range) symbol containing the position
        let best: SysMLSymbol | undefined;
        let bestSize = Infinity;

        for (const symbol of symbols) {
            const r = symbol.selectionRange;
            if (
                line >= r.start.line &&
                line <= r.end.line &&
                (line > r.start.line || character >= r.start.character) &&
                (line < r.end.line || character <= r.end.character)
            ) {
                const size =
                    (r.end.line - r.start.line) * 10000 +
                    (r.end.character - r.start.character);
                if (size < bestSize) {
                    best = symbol;
                    bestSize = size;
                }
            }
        }
        return best;
    }

    /**
     * Find all references to a symbol name across all documents.
     */
    findReferences(name: string): SysMLSymbol[] {
        return this.findByName(name);
    }

    // --------------------------------------------------------------------------
    // Private tree-walking
    // --------------------------------------------------------------------------

    private clearUri(uri: string): void {
        const existing = this.symbolsByUri.get(uri);
        if (existing) {
            for (const sym of existing) {
                this.symbols.delete(sym.qualifiedName);
            }
        }
        this.symbolsByUri.set(uri, []);
    }

    /**
     * Compound usage rules whose first child usage should be skipped
     * because the parent already captures the name.
     */
    private static readonly COMPOUND_RULES = new Set([
        'PerformActionUsage',
        'SatisfyRequirementUsage',
        'AssertConstraintUsage',
    ]);

    /**
     * Recursively walk the parse tree, extracting SysML element declarations.
     *
     * This is a generic tree walker that inspects rule names to identify
     * SysML elements. It works by pattern-matching on the ANTLR rule
     * context class names from the generated parser.
     */
    private walkTree(
        ctx: ParserRuleContext,
        uri: string,
        currentScope: Scope,
        parentQualifiedName: string,
        skipChildUsages: boolean = false,
    ): void {
        const ruleName = this.getRuleName(ctx);

        // When inside a compound rule (e.g., PerformActionUsage), skip
        // direct child usage rules like ActionUsage that would duplicate
        // the symbol already registered by the parent.
        if (skipChildUsages) {
            const kind = this.inferKind(ruleName, ctx);
            if (kind !== undefined) {
                // This is a direct child usage rule — skip it but walk deeper
                for (let i = 0; i < ctx.getChildCount(); i++) {
                    const child = ctx.getChild(i);
                    if (child instanceof ParserRuleContext) {
                        this.walkTree(child, uri, currentScope, parentQualifiedName, false);
                    }
                }
                return;
            }
        }

        // Try to extract a symbol from this context
        const symbol = this.tryExtractSymbol(ctx, uri, ruleName, parentQualifiedName);

        let childScope = currentScope;

        if (symbol) {
            this.registerSymbol(symbol, uri, currentScope);
            // Create a child scope for definitions and packages
            childScope = new Scope(symbol.qualifiedName, currentScope);
        }

        // Determine if children should skip duplicate usage rules
        const isCompound = SymbolTable.COMPOUND_RULES.has(ruleName);

        // Walk children
        for (let i = 0; i < ctx.getChildCount(); i++) {
            const child = ctx.getChild(i);
            if (child instanceof ParserRuleContext) {
                this.walkTree(
                    child,
                    uri,
                    childScope,
                    symbol?.qualifiedName ?? parentQualifiedName,
                    isCompound && symbol !== undefined,
                );
            }
        }
    }

    private registerSymbol(symbol: SysMLSymbol, uri: string, scope: Scope): void {
        // Deduplicate: if a symbol at the same position already exists, skip.
        // This prevents wrapper rules (e.g., PerformActionUsage → ActionUsage)
        // from creating duplicate entries for the same declaration.
        const existing = this.symbols.get(symbol.qualifiedName);
        if (existing && existing.uri === uri &&
            existing.range.start.line === symbol.range.start.line) {
            return;
        }

        // Skip symbols with repeated trailing segments — these are
        // artifacts of nested wrapper rules (e.g., Parent::X::Y::X::Y).
        // Only apply when there are enough segments to indicate nesting
        // (at least 3), so we don't reject legitimate cases like
        // Package::Package where a definition shares its package name.
        const segments = symbol.qualifiedName.split('::');
        if (segments.length >= 3) {
            // Check for repeated suffix of length 1..half
            const maxRepeatLen = Math.floor(segments.length / 2);
            for (let len = 1; len <= maxRepeatLen; len++) {
                const tail = segments.slice(-len).join('::');
                const prev = segments.slice(-2 * len, -len).join('::');
                if (tail === prev) {
                    return;
                }
            }
        }

        this.symbols.set(symbol.qualifiedName, symbol);
        const uriSymbols = this.symbolsByUri.get(uri) ?? [];
        uriSymbols.push(symbol);
        this.symbolsByUri.set(uri, uriSymbols);
        scope.define(symbol);
    }

    /**
     * Get the parser rule name from a context (e.g., "packageDeclaration").
     */
    private getRuleName(ctx: ParserRuleContext): string {
        const ctorName = ctx.constructor.name;
        // ANTLR generates contexts like "PackageDeclarationContext"
        // Strip "Context" suffix to get the rule name
        if (ctorName.endsWith('Context')) {
            return ctorName.slice(0, -'Context'.length);
        }
        return ctorName;
    }

    /**
     * Try to extract a SysMLSymbol from a parse tree context.
     * Returns undefined if this context doesn't represent a named declaration.
     */
    private tryExtractSymbol(
        ctx: ParserRuleContext,
        uri: string,
        ruleName: string,
        parentQualifiedName: string,
    ): SysMLSymbol | undefined {
        // Map rule names to SysML element kinds
        const kind = this.inferKind(ruleName, ctx);
        if (kind === undefined) {
            return undefined;
        }

        // Extract the name from the context
        const name = this.extractName(ctx);
        if (!name) {
            return undefined;
        }

        const qualifiedName = parentQualifiedName
            ? `${parentQualifiedName}::${name}`
            : name;

        const range = contextToRange(ctx);
        const selectionRange = this.extractNameRange(ctx) ?? range;
        const typeName = this.extractTypeName(ctx);
        const documentation = this.extractDocumentation(ctx);

        return {
            name,
            kind,
            qualifiedName,
            range,
            selectionRange,
            uri,
            typeName,
            documentation,
            parentQualifiedName: parentQualifiedName || undefined,
            children: [],
        };
    }

    /**
     * Infer the SysML element kind from the ANTLR rule name.
     *
     * IMPORTANT: Definitions and usages are checked BEFORE package to avoid
     * false matches from wrapper rules (PackageMember, PackageBodyElement).
     * Only exact package rule names are matched.
     */
    private inferKind(
        ruleName: string,
        _ctx: ParserRuleContext,
    ): SysMLElementKind | undefined {
        // Use a map for O(1) lookup on exact rule names first
        const exact = SymbolTable.RULE_KIND_MAP.get(ruleName);
        if (exact !== undefined) return exact;

        // Fallback: pattern matching for less common rule variants
        const lower = ruleName.toLowerCase();

        // Definitions
        if (lower.includes('partdefinition')) return SysMLElementKind.PartDef;
        if (lower.includes('attributedefinition')) return SysMLElementKind.AttributeDef;
        if (lower.includes('portdefinition')) return SysMLElementKind.PortDef;
        if (lower.includes('connectiondefinition')) return SysMLElementKind.ConnectionDef;
        if (lower.includes('interfacedefinition')) return SysMLElementKind.InterfaceDef;
        if (lower.includes('actiondefinition')) return SysMLElementKind.ActionDef;
        if (lower.includes('statedefinition')) return SysMLElementKind.StateDef;
        if (lower.includes('requirementdefinition')) return SysMLElementKind.RequirementDef;
        if (lower.includes('constraintdefinition')) return SysMLElementKind.ConstraintDef;
        if (lower.includes('itemdefinition')) return SysMLElementKind.ItemDef;
        if (lower.includes('allocationdefinition')) return SysMLElementKind.AllocationDef;
        if (lower.includes('usecasedefinition')) return SysMLElementKind.UseCaseDef;
        if (lower.includes('enumerationdefinition')) return SysMLElementKind.EnumDef;
        if (lower.includes('calculationdefinition') || lower.includes('calcdefinition')) return SysMLElementKind.CalcDef;
        if (lower.includes('viewdefinition')) return SysMLElementKind.ViewDef;
        if (lower.includes('viewpointdefinition')) return SysMLElementKind.ViewpointDef;
        if (lower.includes('metadatadefinition')) return SysMLElementKind.MetadataDef;
        if (lower.includes('renderingdefinition')) return SysMLElementKind.RenderingDef;
        if (lower.includes('analysiscasedefinition')) return SysMLElementKind.AnalysisCaseDef;
        if (lower.includes('verificationcasedefinition')) return SysMLElementKind.VerificationCaseDef;

        // Usages (specific compound names first)
        if (lower.includes('performactionusage')) return SysMLElementKind.ActionUsage;
        if (lower.includes('partusage')) return SysMLElementKind.PartUsage;
        if (lower.includes('attributeusage')) return SysMLElementKind.AttributeUsage;
        if (lower.includes('portusage')) return SysMLElementKind.PortUsage;
        if (lower.includes('connectionusage')) return SysMLElementKind.ConnectionUsage;
        if (lower.includes('interfaceusage')) return SysMLElementKind.InterfaceUsage;
        if (lower.includes('actionusage')) return SysMLElementKind.ActionUsage;
        if (lower.includes('stateusage')) return SysMLElementKind.StateUsage;
        if (lower.includes('requirementusage')) return SysMLElementKind.RequirementUsage;
        if (lower.includes('constraintusage')) return SysMLElementKind.ConstraintUsage;
        if (lower.includes('itemusage')) return SysMLElementKind.ItemUsage;
        if (lower.includes('allocationusage')) return SysMLElementKind.AllocationUsage;
        if (lower.includes('usecaseusage')) return SysMLElementKind.UseCaseUsage;
        if (lower.includes('viewusage')) return SysMLElementKind.ViewUsage;
        if (lower.includes('viewpointusage')) return SysMLElementKind.ViewpointUsage;
        if (lower.includes('concernusage')) return SysMLElementKind.ConstraintUsage;
        if (lower.includes('portionusage')) return SysMLElementKind.PartUsage; // timeslice/snapshot
        if (lower.includes('satisfyrequirementusage')) return SysMLElementKind.RequirementUsage;
        if (lower.includes('assertconstraintusage')) return SysMLElementKind.ConstraintUsage;

        return undefined;
    }

    /** Exact rule name → kind map for fast lookup on common rules. */
    private static readonly RULE_KIND_MAP = new Map<string, SysMLElementKind>([
        // Package
        ['Package', SysMLElementKind.Package],
        ['PackageDeclaration', SysMLElementKind.Package],
        ['LibraryPackage', SysMLElementKind.Package],
        // Definitions
        ['PartDefinition', SysMLElementKind.PartDef],
        ['AttributeDefinition', SysMLElementKind.AttributeDef],
        ['PortDefinition', SysMLElementKind.PortDef],
        ['ConnectionDefinition', SysMLElementKind.ConnectionDef],
        ['InterfaceDefinition', SysMLElementKind.InterfaceDef],
        ['ActionDefinition', SysMLElementKind.ActionDef],
        ['StateDefinition', SysMLElementKind.StateDef],
        ['RequirementDefinition', SysMLElementKind.RequirementDef],
        ['ConstraintDefinition', SysMLElementKind.ConstraintDef],
        ['ItemDefinition', SysMLElementKind.ItemDef],
        ['AllocationDefinition', SysMLElementKind.AllocationDef],
        ['UseCaseDefinition', SysMLElementKind.UseCaseDef],
        ['EnumerationDefinition', SysMLElementKind.EnumDef],
        ['CalculationDefinition', SysMLElementKind.CalcDef],
        ['ViewDefinition', SysMLElementKind.ViewDef],
        ['ViewpointDefinition', SysMLElementKind.ViewpointDef],
        ['MetadataDefinition', SysMLElementKind.MetadataDef],
        ['RenderingDefinition', SysMLElementKind.RenderingDef],
        ['AnalysisCaseDefinition', SysMLElementKind.AnalysisCaseDef],
        ['VerificationCaseDefinition', SysMLElementKind.VerificationCaseDef],
        // Usages
        ['PartUsage', SysMLElementKind.PartUsage],
        ['AttributeUsage', SysMLElementKind.AttributeUsage],
        ['PortUsage', SysMLElementKind.PortUsage],
        ['ConnectionUsage', SysMLElementKind.ConnectionUsage],
        ['InterfaceUsage', SysMLElementKind.InterfaceUsage],
        ['ActionUsage', SysMLElementKind.ActionUsage],
        ['StateUsage', SysMLElementKind.StateUsage],
        ['RequirementUsage', SysMLElementKind.RequirementUsage],
        ['ConstraintUsage', SysMLElementKind.ConstraintUsage],
        ['ItemUsage', SysMLElementKind.ItemUsage],
        ['AllocationUsage', SysMLElementKind.AllocationUsage],
        ['UseCaseUsage', SysMLElementKind.UseCaseUsage],
        ['EnumerationUsage', SysMLElementKind.EnumUsage],
        ['CalcUsage', SysMLElementKind.CalcUsage],
        ['ViewUsage', SysMLElementKind.ViewUsage],
        ['ViewpointUsage', SysMLElementKind.ViewpointUsage],
        // Additional behavioral/structural usage rules
        ['PerformActionUsage', SysMLElementKind.ActionUsage],
        ['SatisfyRequirementUsage', SysMLElementKind.RequirementUsage],
        ['AssertConstraintUsage', SysMLElementKind.ConstraintUsage],
        ['ConcernUsage', SysMLElementKind.ConstraintUsage],
        ['PortionUsage', SysMLElementKind.PartUsage], // timeslice/snapshot
    ]);

    /**
     * Extract the declared name from a parse tree context.
     * Looks for an IDENT token or a name/identification sub-rule.
     */
    private extractName(ctx: ParserRuleContext): string | undefined {
        // Walk children looking for a name-producing rule or IDENT token
        for (let i = 0; i < ctx.getChildCount(); i++) {
            const child = ctx.getChild(i);

            // Direct terminal (identifier token or unrestricted name)
            if (child instanceof TerminalNode) {
                const token = child.symbol;
                if (this.isIdentifierToken(token)) {
                    return this.getTokenName(token);
                }
            }

            // Check child rules named 'identification', 'declarationUsageName', etc.
            if (child instanceof ParserRuleContext) {
                const childRule = this.getRuleName(child);
                if (
                    childRule.toLowerCase().includes('identification') ||
                    childRule.toLowerCase().includes('declarationname') ||
                    childRule.toLowerCase().includes('qualifiedname') ||
                    childRule.toLowerCase() === 'name'
                ) {
                    const name = this.extractNameFromSubtree(child);
                    if (name) return name;
                }
            }
        }

        // Fallback: look deeper for any identifier in the first few children
        for (let i = 0; i < Math.min(ctx.getChildCount(), 5); i++) {
            const child = ctx.getChild(i);
            if (child instanceof ParserRuleContext) {
                const name = this.extractName(child);
                if (name) return name;
            }
        }

        return undefined;
    }

    /**
     * Extract the range of just the name token.
     */
    private extractNameRange(ctx: ParserRuleContext): Range | undefined {
        for (let i = 0; i < ctx.getChildCount(); i++) {
            const child = ctx.getChild(i);
            if (child instanceof TerminalNode && this.isIdentifierToken(child.symbol)) {
                const range = tokenToRange(child.symbol);
                // For quoted names like 'Drive Batmobile', shrink the range
                // to exclude the quotes (for better rename/hover experience)
                const text = child.symbol.text;
                if (text && text.startsWith("'") && text.endsWith("'")) {
                    return {
                        start: { line: range.start.line, character: range.start.character + 1 },
                        end: { line: range.end.line, character: range.end.character - 1 },
                    };
                }
                return range;
            }
            if (child instanceof ParserRuleContext) {
                const result = this.extractNameRange(child);
                if (result) return result;
            }
        }
        return undefined;
    }

    /**
     * Extract a type name from specialization syntax (": TypeName" or ":> TypeName").
     */
    private extractTypeName(ctx: ParserRuleContext): string | undefined {
        const text = ctx.getText();
        // Look for type specialization patterns
        const match = text.match(/[:>]+\s*([A-Za-z_][\w:]*)/);
        return match?.[1];
    }

    /**
     * Extract documentation from a comment or doc child.
     */
    private extractDocumentation(ctx: ParserRuleContext): string | undefined {
        for (let i = 0; i < ctx.getChildCount(); i++) {
            const child = ctx.getChild(i);
            if (child instanceof ParserRuleContext) {
                const ruleName = this.getRuleName(child).toLowerCase();
                if (ruleName.includes('comment') || ruleName.includes('doc') || ruleName.includes('documentation')) {
                    return this.extractTextFromSubtree(child);
                }
            }
        }
        return undefined;
    }

    /**
     * Check if a token is an identifier or unrestricted name (quoted name).
     * SysML v2 allows names like 'Drive Batmobile' enclosed in single quotes.
     */
    private isIdentifierToken(token: Token): boolean {
        const text = token.text;
        if (!text) return false;
        // Unrestricted names are enclosed in single quotes
        if (text.startsWith("'") && text.endsWith("'") && text.length > 2) {
            return true;
        }
        // Regular identifiers start with a letter or underscore
        return /^[a-zA-Z_]/.test(text) && !this.isKeyword(text);
    }

    /**
     * Get the display name from a token (strips quotes from unrestricted names).
     */
    private getTokenName(token: Token): string | undefined {
        const text = token.text;
        if (!text) return undefined;
        // Strip quotes from unrestricted names
        if (text.startsWith("'") && text.endsWith("'") && text.length > 2) {
            return text.slice(1, -1);
        }
        return text;
    }

    /**
     * Check if a text is a SysML keyword.
     */
    private isKeyword(text: string): boolean {
        const keywords = new Set([
            'about', 'abstract', 'accept', 'action', 'actor', 'after', 'alias',
            'all', 'allocate', 'allocation', 'analysis', 'and', 'as', 'assert',
            'assign', 'assume', 'attribute', 'bind', 'binding', 'bool', 'by',
            'calc', 'case', 'comment', 'concern', 'connect', 'connection',
            'constraint', 'decide', 'def', 'default', 'defined', 'dependency',
            'derived', 'do', 'doc', 'else', 'end', 'entry', 'enum', 'event',
            'exhibit', 'exit', 'expose', 'false', 'feature', 'filter', 'first',
            'flow', 'for', 'fork', 'frame', 'from', 'hastype', 'if', 'implies',
            'import', 'in', 'include', 'individual', 'inout', 'interface',
            'istype', 'item', 'join', 'language', 'library', 'locale', 'merge',
            'message', 'meta', 'metadata', 'multiplicity', 'namespace', 'nonunique',
            'not', 'null', 'objective', 'occurrence', 'of', 'or', 'ordered', 'out',
            'package', 'parallel', 'part', 'perform', 'port', 'private',
            'protected', 'public', 'readonly', 'redefines', 'ref', 'references',
            'render', 'rendering', 'rep', 'require', 'requirement', 'return',
            'satisfy', 'send', 'snapshot', 'specializes', 'stakeholder', 'state',
            'subject', 'subsets', 'succession', 'then', 'timeslice', 'to', 'transition',
            'true', 'type', 'use', 'variant', 'variation', 'verification', 'verify',
            'view', 'viewpoint', 'when', 'while', 'xor',
        ]);
        return keywords.has(text);
    }

    /**
     * Extract a name from a subtree, handling unrestricted (quoted) names.
     * Used specifically for Identification/Name rules.
     */
    private extractNameFromSubtree(ctx: ParserRuleContext): string | undefined {
        const parts: string[] = [];
        for (let i = 0; i < ctx.getChildCount(); i++) {
            const child = ctx.getChild(i);
            if (child instanceof TerminalNode) {
                if (this.isIdentifierToken(child.symbol)) {
                    const name = this.getTokenName(child.symbol);
                    if (name) parts.push(name);
                }
            } else if (child instanceof ParserRuleContext) {
                const sub = this.extractNameFromSubtree(child);
                if (sub) parts.push(sub);
            }
        }
        return parts.length > 0 ? parts.join('::') : undefined;
    }

    /**
     * Extract all text content from a subtree (concatenate terminal nodes).
     */
    private extractTextFromSubtree(ctx: ParserRuleContext): string | undefined {
        const parts: string[] = [];
        for (let i = 0; i < ctx.getChildCount(); i++) {
            const child = ctx.getChild(i);
            if (child instanceof TerminalNode) {
                const text = child.symbol.text;
                if (text && this.isIdentifierToken(child.symbol)) {
                    const name = this.getTokenName(child.symbol);
                    if (name) parts.push(name);
                }
            } else if (child instanceof ParserRuleContext) {
                const sub = this.extractTextFromSubtree(child);
                if (sub) parts.push(sub);
            }
        }
        return parts.length > 0 ? parts.join('::') : undefined;
    }
}
