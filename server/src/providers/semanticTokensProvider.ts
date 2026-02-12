import {
    SemanticTokensParams,
    SemanticTokens,
    SemanticTokensBuilder,
} from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { Token } from 'antlr4ng';

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
 * and surrounding context.
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

        for (const token of tokens) {
            if (!token.text || token.channel !== 0) {
                continue; // Skip hidden channel tokens (whitespace)
            }

            const tokenType = this.classifyToken(token);
            if (tokenType === undefined) {
                continue;
            }

            const line = (token.line ?? 1) - 1; // 0-based
            const char = token.column ?? 0;
            const length = token.text.length;

            builder.push(line, char, length, tokenType, 0);
        }

        return builder.build();
    }

    /**
     * Classify a token into a semantic token type index.
     */
    private classifyToken(token: Token): number | undefined {
        const text = token.text;
        if (!text) return undefined;

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

        // SysML keywords (based on token type from the lexer)
        if (this.isKeyword(text)) {
            return 6; // keyword
        }

        // Default: identifiers — could refine with symbol table context
        if (/^[a-zA-Z_]\w*$/.test(text)) {
            return 3; // variable (generic identifier)
        }

        return undefined;
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
