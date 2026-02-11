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
    ): void {
        const ruleName = this.getRuleName(ctx);

        // Try to extract a symbol from this context
        const symbol = this.tryExtractSymbol(ctx, uri, ruleName, parentQualifiedName);

        let childScope = currentScope;

        if (symbol) {
            this.registerSymbol(symbol, uri, currentScope);
            // Create a child scope for definitions and packages
            childScope = new Scope(symbol.qualifiedName, currentScope);
        }

        // Walk children
        for (let i = 0; i < ctx.getChildCount(); i++) {
            const child = ctx.getChild(i);
            if (child instanceof ParserRuleContext) {
                this.walkTree(
                    child,
                    uri,
                    childScope,
                    symbol?.qualifiedName ?? parentQualifiedName,
                );
            }
        }
    }

    private registerSymbol(symbol: SysMLSymbol, uri: string, scope: Scope): void {
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
     */
    private inferKind(
        ruleName: string,
        ctx: ParserRuleContext,
    ): SysMLElementKind | undefined {
        const lower = ruleName.toLowerCase();

        // Package
        if (lower.includes('package') && (lower.includes('declaration') || lower.includes('definition') || lower === 'packagemember')) {
            return SysMLElementKind.Package;
        }

        // Definitions
        if (lower.includes('partdefinition') || lower.includes('partdef')) return SysMLElementKind.PartDef;
        if (lower.includes('attributedefinition') || lower.includes('attributedef')) return SysMLElementKind.AttributeDef;
        if (lower.includes('portdefinition') || lower.includes('portdef')) return SysMLElementKind.PortDef;
        if (lower.includes('connectiondefinition') || lower.includes('connectiondef')) return SysMLElementKind.ConnectionDef;
        if (lower.includes('interfacedefinition') || lower.includes('interfacedef')) return SysMLElementKind.InterfaceDef;
        if (lower.includes('actiondefinition') || lower.includes('actiondef')) return SysMLElementKind.ActionDef;
        if (lower.includes('statedefinition') || lower.includes('statedef')) return SysMLElementKind.StateDef;
        if (lower.includes('requirementdefinition') || lower.includes('requirementdef')) return SysMLElementKind.RequirementDef;
        if (lower.includes('constraintdefinition') || lower.includes('constraintdef')) return SysMLElementKind.ConstraintDef;
        if (lower.includes('itemdefinition') || lower.includes('itemdef')) return SysMLElementKind.ItemDef;
        if (lower.includes('allocationdefinition') || lower.includes('allocationdef')) return SysMLElementKind.AllocationDef;
        if (lower.includes('usecasedefinition') || lower.includes('usecasedef')) return SysMLElementKind.UseCaseDef;
        if (lower.includes('enumerationdefinition') || lower.includes('enumdef') || lower.includes('enumerationdef')) return SysMLElementKind.EnumDef;
        if (lower.includes('calcdefinition') || lower.includes('calcdef')) return SysMLElementKind.CalcDef;
        if (lower.includes('viewdefinition') || lower.includes('viewdef')) return SysMLElementKind.ViewDef;
        if (lower.includes('viewpointdefinition') || lower.includes('viewpointdef')) return SysMLElementKind.ViewpointDef;
        if (lower.includes('metadatadefinition') || lower.includes('metadatadef')) return SysMLElementKind.MetadataDef;

        // Usages
        if (lower.includes('partusage') || (lower.includes('part') && lower.includes('usage'))) return SysMLElementKind.PartUsage;
        if (lower.includes('attributeusage') || (lower.includes('attribute') && lower.includes('usage'))) return SysMLElementKind.AttributeUsage;
        if (lower.includes('portusage') || (lower.includes('port') && lower.includes('usage'))) return SysMLElementKind.PortUsage;
        if (lower.includes('connectionusage') || (lower.includes('connection') && lower.includes('usage'))) return SysMLElementKind.ConnectionUsage;
        if (lower.includes('actionusage') || (lower.includes('action') && lower.includes('usage'))) return SysMLElementKind.ActionUsage;
        if (lower.includes('stateusage') || (lower.includes('state') && lower.includes('usage'))) return SysMLElementKind.StateUsage;
        if (lower.includes('requirementusage') || (lower.includes('requirement') && lower.includes('usage'))) return SysMLElementKind.RequirementUsage;
        if (lower.includes('constraintusage') || (lower.includes('constraint') && lower.includes('usage'))) return SysMLElementKind.ConstraintUsage;
        if (lower.includes('itemusage') || (lower.includes('item') && lower.includes('usage'))) return SysMLElementKind.ItemUsage;
        if (lower.includes('allocationusage') || (lower.includes('allocation') && lower.includes('usage'))) return SysMLElementKind.AllocationUsage;
        if (lower.includes('usecaseusage') || (lower.includes('usecase') && lower.includes('usage'))) return SysMLElementKind.UseCaseUsage;

        return undefined;
    }

    /**
     * Extract the declared name from a parse tree context.
     * Looks for an IDENT token or a name/identification sub-rule.
     */
    private extractName(ctx: ParserRuleContext): string | undefined {
        // Walk children looking for a name-producing rule or IDENT token
        for (let i = 0; i < ctx.getChildCount(); i++) {
            const child = ctx.getChild(i);

            // Direct terminal (identifier token)
            if (child instanceof TerminalNode) {
                const token = child.symbol;
                // Skip keywords — we want identifier tokens only
                if (this.isIdentifierToken(token)) {
                    return token.text ?? undefined;
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
                    const name = this.extractTextFromSubtree(child);
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
                return tokenToRange(child.symbol);
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
     * Check if a token is an identifier (not a keyword or punctuation).
     */
    private isIdentifierToken(token: Token): boolean {
        const text = token.text;
        if (!text) return false;
        // Identifiers start with a letter or underscore
        return /^[a-zA-Z_]/.test(text) && !this.isKeyword(text);
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
     * Extract all text content from a subtree (concatenate terminal nodes).
     */
    private extractTextFromSubtree(ctx: ParserRuleContext): string | undefined {
        const parts: string[] = [];
        for (let i = 0; i < ctx.getChildCount(); i++) {
            const child = ctx.getChild(i);
            if (child instanceof TerminalNode) {
                const text = child.symbol.text;
                if (text && this.isIdentifierToken(child.symbol)) {
                    parts.push(text);
                }
            } else if (child instanceof ParserRuleContext) {
                const sub = this.extractTextFromSubtree(child);
                if (sub) parts.push(sub);
            }
        }
        return parts.length > 0 ? parts.join('::') : undefined;
    }
}
