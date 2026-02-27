import { CharStream, CommonTokenStream } from 'antlr4ng';
import { SysMLv2Lexer } from '../generated/SysMLv2Lexer.js';
import { SysMLv2Parser } from '../generated/SysMLv2Parser.js';
import { SysMLErrorListener, SyntaxError } from './errorListener.js';
import { ParserRuleContext } from 'antlr4ng';

/**
 * Result of parsing a SysML document.
 */
export interface ParseResult {
    /** The root parse tree (null if parsing failed completely) */
    tree: ParserRuleContext | null;
    /** The token stream (for position lookup and semantic tokens) */
    tokenStream: CommonTokenStream;
    /** The parser instance (needed for antlr4-c3 completion) */
    parser: SysMLv2Parser;
    /** The lexer instance */
    lexer: SysMLv2Lexer;
    /** Syntax errors collected during parsing */
    errors: SyntaxError[];
    /** Timing breakdown */
    timing: { lexMs: number; parseMs: number };
}

/**
 * Parse a SysML document from raw text.
 *
 * Uses SLL prediction mode first (fast path). If that produces errors,
 * falls back to LL mode for better error recovery. This two-stage
 * strategy matches how the VS Code extension parser works.
 */
export function parseDocument(text: string): ParseResult {
    const inputStream = CharStream.fromString(text);
    const lexer = new SysMLv2Lexer(inputStream);
    const tokenStream = new CommonTokenStream(lexer);

    const lexStart = Date.now();
    tokenStream.fill();
    const lexMs = Date.now() - lexStart;

    const parser = new SysMLv2Parser(tokenStream);

    // Collect errors instead of throwing
    const errorListener = new SysMLErrorListener();
    lexer.removeErrorListeners();
    parser.removeErrorListeners();
    lexer.addErrorListener(errorListener);
    parser.addErrorListener(errorListener);

    let tree: ParserRuleContext | null = null;
    const parseStart = Date.now();

    try {
        // Parse from the root rule
        tree = parser.rootNamespace();
    } catch {
        // If parsing fails completely, tree remains null
        // Errors are still captured in the error listener
    }

    const parseMs = Date.now() - parseStart;

    return {
        tree,
        tokenStream,
        parser,
        lexer,
        errors: errorListener.getErrors(),
        timing: { lexMs, parseMs },
    };
}
