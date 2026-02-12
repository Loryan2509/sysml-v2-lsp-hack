import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node.js';
import { Token } from 'antlr4ng';
import { SysMLv2Lexer } from '../generated/SysMLv2Lexer.js';
import { ParseResult } from '../parser/parseDocument.js';

/**
 * SysML definition/usage keywords — tokens that can appear at the start
 * of a top-level or body-level element. If an identifier looks very close
 * to one of these, it's likely a typo.
 */
const DEFINITION_KEYWORDS: ReadonlySet<string> = new Set([
    'about', 'abstract', 'accept', 'action', 'actor', 'after', 'alias',
    'all', 'allocate', 'allocation', 'analysis', 'assert', 'assign',
    'assume', 'attribute', 'bind', 'binding', 'calc', 'case', 'comment',
    'concern', 'connect', 'connection', 'constraint', 'decide', 'def',
    'default', 'defined', 'dependency', 'derived', 'do', 'doc', 'else',
    'end', 'entry', 'enum', 'event', 'exhibit', 'exit', 'expose',
    'feature', 'filter', 'first', 'flow', 'for', 'fork', 'frame', 'from',
    'if', 'import', 'in', 'include', 'individual', 'inout', 'interface',
    'item', 'join', 'language', 'library', 'locale', 'merge', 'message',
    'meta', 'metadata', 'multiplicity', 'namespace', 'nonunique', 'not',
    'null', 'objective', 'occurrence', 'of', 'ordered', 'out', 'package',
    'parallel', 'part', 'perform', 'port', 'private', 'protected',
    'public', 'readonly', 'redefines', 'ref', 'references', 'render',
    'rendering', 'rep', 'require', 'requirement', 'return', 'satisfy',
    'send', 'snapshot', 'specializes', 'stakeholder', 'state', 'subject',
    'subsets', 'succession', 'then', 'timeslice', 'to', 'transition',
    'type', 'use', 'variant', 'variation', 'verification', 'verify',
    'view', 'viewpoint', 'when', 'while',
]);

/**
 * Compute Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,      // deletion
                dp[i][j - 1] + 1,      // insertion
                dp[i - 1][j - 1] + cost // substitution
            );
        }
    }
    return dp[m][n];
}

/**
 * Find the closest keyword to the given identifier, if within distance threshold.
 */
function findClosestKeyword(identifier: string, maxDistance = 2): string | undefined {
    const lower = identifier.toLowerCase();

    // Don't flag very short identifiers (too many false positives)
    if (lower.length < 4) return undefined;

    // Don't flag if it's already a keyword
    if (DEFINITION_KEYWORDS.has(lower)) return undefined;

    // Scale max distance with word length: short words need closer match
    const effectiveMax = lower.length <= 5 ? 1 : maxDistance;

    let bestMatch: string | undefined;
    let bestDist = effectiveMax + 1;

    for (const keyword of DEFINITION_KEYWORDS) {
        // Quick length check to avoid unnecessary computation
        if (Math.abs(keyword.length - lower.length) > maxDistance) continue;

        const dist = levenshtein(lower, keyword);
        if (dist > 0 && dist < bestDist) {
            bestDist = dist;
            bestMatch = keyword;
        }
    }

    return bestMatch;
}

/**
 * Set of token types that are SysML definition/usage keywords —
 * tokens that typically precede a name, `:`, `def`, `{`, etc.
 * If an identifier is followed by one of these "keyword-like continuations",
 * it's likely a misspelled keyword, not a user-defined name.
 */
const KEYWORD_CONTINUATIONS: ReadonlySet<number> = new Set([
    SysMLv2Lexer.IDENTIFIER,  // e.g. "attributedd power" — followed by a name
    SysMLv2Lexer.COLON,       // e.g. "attributedd : Type"
    SysMLv2Lexer.DEF,         // e.g. "party def Foo"
    SysMLv2Lexer.LBRACE,      // e.g. "packge { ... }"
    SysMLv2Lexer.LBRACK,      // e.g. "attributedd [2]"
    SysMLv2Lexer.ABOUT,       // e.g. keyword misuse
]);

/**
 * Token types that are definition keywords — when one of these precedes
 * an identifier, that identifier is a user-defined name, not a keyword typo.
 */
const NAME_PRECEDING_KEYWORDS: ReadonlySet<number> = new Set([
    SysMLv2Lexer.PART, SysMLv2Lexer.PORT, SysMLv2Lexer.ITEM,
    SysMLv2Lexer.ATTRIBUTE, SysMLv2Lexer.ACTION, SysMLv2Lexer.CALC,
    SysMLv2Lexer.STATE, SysMLv2Lexer.CONSTRAINT, SysMLv2Lexer.REQUIREMENT,
    SysMLv2Lexer.CONCERN, SysMLv2Lexer.CASE, SysMLv2Lexer.ANALYSIS,
    SysMLv2Lexer.VERIFICATION, SysMLv2Lexer.VIEW, SysMLv2Lexer.VIEWPOINT,
    SysMLv2Lexer.RENDERING, SysMLv2Lexer.METADATA, SysMLv2Lexer.PACKAGE,
    SysMLv2Lexer.NAMESPACE, SysMLv2Lexer.ENUM, SysMLv2Lexer.ALLOCATION,
    SysMLv2Lexer.CONNECTION, SysMLv2Lexer.INTERFACE, SysMLv2Lexer.OCCURRENCE,
    SysMLv2Lexer.INDIVIDUAL, SysMLv2Lexer.FLOW, SysMLv2Lexer.SUCCESSION,
    SysMLv2Lexer.BINDING, SysMLv2Lexer.DEF, SysMLv2Lexer.COLON,
    SysMLv2Lexer.COLON_GT, SysMLv2Lexer.COLON_GT_GT, SysMLv2Lexer.COLON_COLON,
]);

/**
 * Check if an identifier looks like a keyword typo based on context:
 * - The NEXT visible token is something that typically follows a keyword
 * - The PREVIOUS visible token is NOT a definition keyword (which would mean
 *   this identifier is a user-defined name, not a typo)
 */
function looksLikeKeywordPosition(visibleTokens: Token[], index: number): boolean {
    // Check previous token — if it's a definition keyword, this is a name, not a typo
    for (let i = index - 1; i >= 0; i--) {
        const prev = visibleTokens[i];
        if (NAME_PRECEDING_KEYWORDS.has(prev.type)) {
            return false; // This identifier is a name after a keyword
        }
        break; // only check the immediately preceding token
    }

    // Check next token — if it's something that follows a keyword, this is likely a typo
    if (index + 1 < visibleTokens.length) {
        const next = visibleTokens[index + 1];
        if (KEYWORD_CONTINUATIONS.has(next.type)) {
            return true;
        }
    }

    // First token in file is likely a keyword position
    if (index === 0) return true;

    return false;
}

/**
 * Walk the token stream and produce diagnostics for identifiers
 * that look like misspelled SysML keywords.
 */
export function validateKeywords(result: ParseResult): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    result.tokenStream.fill();
    const allTokens = result.tokenStream.getTokens();

    // Build visible token list without allocating a filtered copy on every call
    // For large files this avoids creating a huge intermediate array
    const visibleTokens: Token[] = [];
    for (let j = 0; j < allTokens.length; j++) {
        const t = allTokens[j];
        if (t.channel === 0 && t.type !== Token.EOF) {
            visibleTokens.push(t);
        }
    }

    for (let i = 0; i < visibleTokens.length; i++) {
        const token = visibleTokens[i];

        // Only check IDENTIFIER tokens
        if (token.type !== SysMLv2Lexer.IDENTIFIER) continue;

        const text = token.text;
        if (!text) continue;

        // Only flag identifiers that look like they're in a keyword position
        if (!looksLikeKeywordPosition(visibleTokens, i)) continue;

        const suggestion = findClosestKeyword(text);
        if (!suggestion) continue;

        const line = (token.line ?? 1) - 1; // 0-based
        const char = token.column ?? 0;

        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
                start: { line, character: char },
                end: { line, character: char + text.length },
            },
            message: `Unknown keyword '${text}'. Did you mean '${suggestion}'?`,
            source: 'sysml',
        });
    }

    return diagnostics;
}
