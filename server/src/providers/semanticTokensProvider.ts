import {
    SemanticTokens,
    SemanticTokensBuilder,
    SemanticTokensParams,
} from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';

/**
 * Semantic token types — must match the legend registered in server capabilities.
 */
export const tokenTypes = [
    'namespace',    // 0 — packages
    'type',         // 1 — type references
    'class',        // 2 — definitions
    'variable',     // 3 — usages
    'property',     // 4 — attributes
    'function',     // 5 — actions, calcs
    'keyword',      // 6 — SysML keywords
    'comment',      // 7 — comments
    'string',       // 8 — string literals
    'number',       // 9 — numeric literals
    'operator',     // 10 — operators
    'enum',         // 11 — enumerations, states
    'interface',    // 12 — ports, interfaces
];

export const tokenModifiers = [
    'declaration',   // 0
    'definition',    // 1
    'readonly',      // 2
    'abstract',      // 3
];

/**
 * Provides semantic tokens for rich syntax highlighting.
 *
 * Walks the token stream and classifies tokens based on their type
 * and surrounding context, matching the tmLanguage patterns so that
 * editor and Copilot/MCP chat highlighting agree.
 */
export class SemanticTokensProvider {
    constructor(private documentManager: DocumentManager) { }

    provideSemanticTokens(params: SemanticTokensParams): SemanticTokens {
        const builder = new SemanticTokensBuilder();

        const result = this.documentManager.get(params.textDocument.uri);
        if (!result) {
            return builder.build();
        }

        // Get all tokens from the token stream
        result.tokenStream.fill();
        const tokens = result.tokenStream.getTokens();

        let prevMeaningful: string | undefined;

        for (const token of tokens) {
            if (!token.text || token.channel !== 0) {
                continue; // Skip hidden channel tokens (whitespace)
            }

            const text = token.text;
            const tokenType = this.classifyTokenInContext(text, prevMeaningful);

            // Track previous meaningful token for context-sensitive classification
            prevMeaningful = text;

            if (tokenType === undefined) {
                continue;
            }

            const line = (token.line ?? 1) - 1; // 0-based
            const char = token.column ?? 0;
            const length = text.length;

            builder.push(line, char, length, tokenType, 0);
        }

        return builder.build();
    }

    /**
     * Classify a token using surrounding context to match tmLanguage scopes.
     */
    private classifyTokenInContext(text: string, prev: string | undefined): number | undefined {
        // Comments
        if (text.startsWith('/*') || text.startsWith('//')) {
            return 7; // comment
        }

        // Strings
        if (text.startsWith('"') || text.startsWith("'")) {
            return 8; // string
        }

        // Numbers
        if (/^\d/.test(text)) {
            return 9; // number
        }

        // Operators and punctuation
        if (/^[+\-*/<>=!&|^~%]+$/.test(text) || text === '::' || text === ':>' || text === ':>>') {
            return 10; // operator
        }

        // Punctuation — let tmLanguage handle
        if (/^[{}();,.[\]]$/.test(text) || text === ':') {
            return undefined;
        }

        // SysML keywords
        if (this.isKeyword(text)) {
            return 6; // keyword
        }

        // Identifiers — context-sensitive classification
        if (/^[a-zA-Z_]\w*$/.test(text)) {
            return this.classifyIdentifier(prev);
        }

        return undefined;
    }

    /**
     * Classify an identifier based on the previous meaningful token,
     * mirroring the tmLanguage patterns for consistent highlighting.
     */
    private classifyIdentifier(prev: string | undefined): number {
        if (!prev) return 3; // default: variable

        // After 'def' → type definition (matches entity.name.type.sysml)
        if (prev === 'def') return 2; // class

        // After package/namespace/library → namespace (matches entity.name.namespace.sysml)
        if (prev === 'package' || prev === 'namespace' || prev === 'library') return 0; // namespace

        // After action/calc → function name (matches entity.name.function.sysml)
        if (prev === 'action' || prev === 'calc' || prev === 'analysis' || prev === 'verification') return 5; // function

        // After ':' or ':>' or ':>>' → type reference (matches entity.name.type.sysml)
        if (prev === ':' || prev === ':>' || prev === ':>>') return 1; // type

        // After 'attribute' → property (matches variable.other.property.sysml)
        if (prev === 'attribute') return 4; // property

        // After structural/usage keywords → member variable (matches variable.other.member.sysml)
        if (this.isStructuralKeyword(prev)) return 3; // variable

        // Default: generic identifier
        return 3; // variable
    }

    /**
     * Keywords that precede member/instance names in usage declarations.
     */
    private isStructuralKeyword(text: string): boolean {
        const structural = new Set([
            'part', 'port', 'item', 'state', 'constraint', 'requirement',
            'concern', 'case', 'view', 'viewpoint', 'rendering',
            'allocation', 'connection', 'interface', 'occurrence',
            'individual', 'flow', 'binding', 'succession', 'metadata',
            'enum', 'actor', 'subject', 'ref', 'use',
        ]);
        return structural.has(text);
    }

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
}
