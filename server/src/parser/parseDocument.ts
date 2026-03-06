import { BailErrorStrategy, CharStream, CommonTokenStream, DefaultErrorStrategy, ParserRuleContext, PredictionMode } from 'antlr4ng';
import { SysMLv2Lexer } from '../generated/SysMLv2Lexer.js';
import { SysMLv2Parser } from '../generated/SysMLv2Parser.js';
import { clearPreSeededDFA, isDfaPreSeeded } from './dfaLoader.js';
import { SyntaxError, SysMLErrorListener } from './errorListener.js';
import { WARMUP_TEXT } from './warmupText.js';

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
 * Uses SLL prediction mode first (fast path). If SLL fails with a
 * parse error, falls back to LL mode for correct error recovery.
 * This two-stage strategy is the standard ANTLR4 optimisation —
 * SLL handles the vast majority of inputs and is ~2-3x faster.
 *
 * If the DFA has been pre-seeded from a snapshot and the parser
 * throws a TypeError (uncovered edge), the DFA is cleared and the
 * parse retried.  Additionally, if the pre-seeded DFA produces
 * parse errors, we retry once with a cleared DFA to rule out
 * stale snapshot edges producing bogus errors (issue #15).
 */
export function parseDocument(text: string): ParseResult {
    try {
        const result = parseDocumentCore(text);
        // If errors occurred and DFA is pre-seeded, the snapshot may
        // be stale — a missing edge in the pre-seeded DFA produces
        // an ERROR alternative instead of a TypeError.  Retry once
        // with the DFA cleared so the ATN can build correct edges.
        if (result.errors.length > 0 && isDfaPreSeeded()) {
            clearPreSeededDFA();
            return parseDocumentCore(text);
        }
        return result;
    } catch (e: unknown) {
        if (isDfaPreSeeded() && e instanceof TypeError) {
            // Pre-seeded DFA hit a token pattern it doesn't cover.
            // Clear all pre-seeded states and re-parse from scratch.
            clearPreSeededDFA();
            return parseDocumentCore(text);
        }
        throw e;
    }
}

function parseDocumentCore(text: string): ParseResult {
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

    let tree: ParserRuleContext | null = null;
    const parseStart = Date.now();

    // Stage 1: SLL (fast path — no full context, bail on ambiguity)
    try {
        parser.interpreter.predictionMode = PredictionMode.SLL;
        parser.errorHandler = new BailErrorStrategy();
        tree = parser.rootNamespace();
    } catch {
        // SLL failed — fall back to LL with full error recovery
        tree = null;
    }

    if (!tree) {
        // Stage 2: LL (full context — proper error recovery & messages)
        tokenStream.seek(0);
        parser.reset();
        parser.interpreter.predictionMode = PredictionMode.LL;
        parser.errorHandler = new DefaultErrorStrategy();
        parser.addErrorListener(errorListener);
        try {
            tree = parser.rootNamespace();
        } catch {
            // If parsing fails completely, tree remains null
        }
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

// ---------------------------------------------------------------------------
// DFA warm-up
//
// The ANTLR4 parser uses a static ATN with lazily-built DFA tables.
// The first parse of a session populates these tables (~20 s for the
// full SysML v2 grammar).  All subsequent parses reuse them (~50 ms).
//
// warmupDFA() parses representative SysML text in small chunks using
// setImmediate between chunks so the Node event loop stays responsive
// for incoming LSP requests.  If a real parse arrives mid-warmup, the
// DFA is already partially populated, so even aborted warm-ups help.
// ---------------------------------------------------------------------------

/** Split the monolithic warm-up text into independently parseable chunks. */
function createWarmupChunks(): string[] {
    const allLines = WARMUP_TEXT.split('\n');
    // Strip the outer `package WarmUp {` … `}` wrapper
    const inner = allLines.slice(1, allLines.length - 1);
    const CHUNK_SIZE = 30;
    const chunks: string[] = [];
    for (let i = 0; i < inner.length; i += CHUNK_SIZE) {
        const slice = inner.slice(i, i + CHUNK_SIZE).join('\n');
        chunks.push(`package WU_${chunks.length} {\n${slice}\n}`);
    }
    return chunks;
}

/** Parse a single snippet to exercise the DFA without keeping results. */
function parseSnippet(text: string): void {
    const input = CharStream.fromString(text);
    const lexer = new SysMLv2Lexer(input);
    const tokens = new CommonTokenStream(lexer);
    tokens.fill();
    const parser = new SysMLv2Parser(tokens);
    parser.removeErrorListeners();
    parser.interpreter.predictionMode = PredictionMode.SLL;
    parser.errorHandler = new BailErrorStrategy();
    try {
        parser.rootNamespace();
    } catch {
        // SLL bail-out → try LL for remaining DFA coverage
        tokens.seek(0);
        parser.reset();
        parser.interpreter.predictionMode = PredictionMode.LL;
        parser.errorHandler = new DefaultErrorStrategy();
        parser.removeErrorListeners();
        try { parser.rootNamespace(); } catch { /* best effort */ }
    }
}

export interface WarmupProgress {
    chunksCompleted: number;
    totalChunks: number;
    elapsedMs: number;
}

/**
 * Cooperatively warm up the ANTLR4 DFA cache on the main thread.
 *
 * Returns a promise that resolves when all chunks are parsed (or the
 * warm-up is cancelled).  Calls `onProgress` after each chunk so the
 * caller can log / notify the client.
 *
 * Call `cancel()` on the returned handle to abort early (e.g. when the
 * first real document is opened and will finish warming the DFA itself).
 */
export function warmupDFA(
    onProgress?: (p: WarmupProgress) => void,
): { promise: Promise<WarmupProgress>; cancel: () => void } {
    const chunks = createWarmupChunks();
    const t0 = Date.now();
    let cancelled = false;

    const cancel = () => { cancelled = true; };

    const promise = new Promise<WarmupProgress>((resolve) => {
        let i = 0;

        function next() {
            if (cancelled || i >= chunks.length) {
                const result: WarmupProgress = {
                    chunksCompleted: i,
                    totalChunks: chunks.length,
                    elapsedMs: Date.now() - t0,
                };
                resolve(result);
                return;
            }

            try {
                parseSnippet(chunks[i]);
            } catch {
                // best effort — continue with next chunk
            }
            i++;

            const progress: WarmupProgress = {
                chunksCompleted: i,
                totalChunks: chunks.length,
                elapsedMs: Date.now() - t0,
            };
            onProgress?.(progress);

            // Yield to the event loop so LSP requests can be serviced
            setImmediate(next);
        }

        setImmediate(next);
    });

    return { promise, cancel };
}
