import {
    CharStream,
    CommonTokenStream,
    ParserRuleContext,
    PredictionMode,
    BailErrorStrategy,
    DefaultErrorStrategy,
} from 'antlr4ng';
import { SysMLv2Lexer } from '../generated/SysMLv2Lexer.js';
import { SysMLv2Parser } from '../generated/SysMLv2Parser.js';
import { SysMLErrorListener, SyntaxError } from './errorListener.js';

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
    /** Which prediction mode produced the final result */
    mode: 'SLL' | 'LL';
    /** Timing breakdown in ms */
    timing: { lexMs: number; parseMs: number };
}

/**
 * Parse a SysML document from raw text.
 *
 * Uses SLL prediction mode first (fast path). If SLL fails with a
 * parse error, falls back to full LL mode for better error recovery.
 * SLL is typically 10–100× faster than LL for correct input.
 */
export function parseDocument(text: string): ParseResult {
    const lexStart = Date.now();
    const inputStream = CharStream.fromString(text);
    const lexer = new SysMLv2Lexer(inputStream);
    const tokenStream = new CommonTokenStream(lexer);
    // Pre-fill the token stream once — reused across SLL and LL attempts
    tokenStream.fill();
    const lexMs = Date.now() - lexStart;

    // --- SLL attempt (fast path) ---
    const parseStart = Date.now();
    const parser = new SysMLv2Parser(tokenStream);
    parser.removeErrorListeners(); // suppress console noise
    parser.interpreter.predictionMode = PredictionMode.SLL;
    parser.errorHandler = new BailErrorStrategy();

    let tree: ParserRuleContext | null = null;
    let mode: 'SLL' | 'LL' = 'SLL';

    try {
        tree = parser.rootNamespace();
        const parseMs = Date.now() - parseStart;
        // SLL succeeded — fast path, no syntax errors in well-formed input
        return {
            tree,
            tokenStream,
            parser,
            lexer,
            errors: [],
            mode,
            timing: { lexMs, parseMs },
        };
    } catch {
        // SLL failed — fall through to LL
    }

    // --- LL fallback (slower, better error recovery) ---
    mode = 'LL';
    const llStart = Date.now();
    tokenStream.seek(0);
    parser.reset();
    parser.interpreter.predictionMode = PredictionMode.LL;
    parser.errorHandler = new DefaultErrorStrategy();

    const errorListener = new SysMLErrorListener();
    lexer.removeErrorListeners();
    parser.removeErrorListeners();
    parser.addErrorListener(errorListener);

    try {
        tree = parser.rootNamespace();
    } catch {
        // tree remains null
    }
    const parseMs = Date.now() - llStart;

    return {
        tree,
        tokenStream,
        parser,
        lexer,
        errors: errorListener.getErrors(),
        mode,
        timing: { lexMs, parseMs },
    };
}
