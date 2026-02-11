import { Token, ParserRuleContext } from 'antlr4ng';
import { Position, Range } from 'vscode-languageserver/node.js';

/**
 * Convert an ANTLR token to an LSP Position.
 * ANTLR lines are 1-based, LSP positions are 0-based.
 */
export function tokenToPosition(token: Token): Position {
    return {
        line: (token.line ?? 1) - 1,
        character: token.column ?? 0,
    };
}

/**
 * Convert an ANTLR token to an LSP Range (single token span).
 */
export function tokenToRange(token: Token): Range {
    const start = tokenToPosition(token);
    const length = token.text?.length ?? 1;
    return {
        start,
        end: { line: start.line, character: start.character + length },
    };
}

/**
 * Convert an ANTLR ParserRuleContext to an LSP Range (spanning start to stop tokens).
 */
export function contextToRange(ctx: ParserRuleContext): Range {
    const startToken = ctx.start;
    const stopToken = ctx.stop ?? ctx.start;

    if (!startToken) {
        return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    }

    const start: Position = {
        line: (startToken.line ?? 1) - 1,
        character: startToken.column ?? 0,
    };

    const end: Position = stopToken
        ? {
              line: (stopToken.line ?? 1) - 1,
              character: (stopToken.column ?? 0) + (stopToken.text?.length ?? 1),
          }
        : { line: start.line, character: start.character + 1 };

    return { start, end };
}

/**
 * Check if an LSP position falls within a token's range.
 */
export function isPositionInToken(position: Position, token: Token): boolean {
    const range = tokenToRange(token);
    return isPositionInRange(position, range);
}

/**
 * Check if an LSP position falls within a range.
 */
export function isPositionInRange(position: Position, range: Range): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
        return false;
    }
    if (position.line === range.start.line && position.character < range.start.character) {
        return false;
    }
    if (position.line === range.end.line && position.character > range.end.character) {
        return false;
    }
    return true;
}

/**
 * Find the token at a given LSP position in a token stream.
 */
export function findTokenAtPosition(
    tokens: Token[],
    position: Position,
): Token | undefined {
    for (const token of tokens) {
        if (isPositionInToken(position, token)) {
            return token;
        }
    }
    return undefined;
}

/**
 * Get the token index closest to a given LSP position.
 */
export function getTokenIndexAtPosition(
    tokens: Token[],
    position: Position,
): number {
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const tokenLine = (token.line ?? 1) - 1;
        const tokenCol = token.column ?? 0;
        const tokenEnd = tokenCol + (token.text?.length ?? 1);

        if (tokenLine === position.line && tokenCol <= position.character && position.character <= tokenEnd) {
            return i;
        }
        // If we've passed the position, return the previous token
        if (tokenLine > position.line || (tokenLine === position.line && tokenCol > position.character)) {
            return Math.max(0, i - 1);
        }
    }
    return tokens.length - 1;
}
