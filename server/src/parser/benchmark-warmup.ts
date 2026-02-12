/**
 * Benchmark: measure DFA warmup time and subsequent parse speed.
 * Run with: node --loader ts-node/esm server/src/parser/benchmark-warmup.ts
 * Or after compile: node server/out/parser/benchmark-warmup.js
 */
import { CharStream, CommonTokenStream, PredictionMode, BailErrorStrategy, DefaultErrorStrategy } from 'antlr4ng';
import { SysMLv2Lexer } from '../generated/SysMLv2Lexer.js';
import { SysMLv2Parser } from '../generated/SysMLv2Parser.js';
import { WARMUP_TEXT } from './warmupText.js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parse(text: string, sll: boolean): { elapsed: number; errors: number } {
    const input = CharStream.fromString(text);
    const lexer = new SysMLv2Lexer(input);
    const tokens = new CommonTokenStream(lexer);
    tokens.fill();
    const parser = new SysMLv2Parser(tokens);
    parser.removeErrorListeners();
    if (sll) {
        parser.interpreter.predictionMode = 0; // SLL
    }
    let errors = 0;
    parser.addErrorListener({
        syntaxError: () => { errors++; },
        reportAmbiguity: () => { },
        reportAttemptingFullContext: () => { },
        reportContextSensitivity: () => { },
    });
    const start = performance.now();
    parser.rootNamespace();
    const elapsed = performance.now() - start;
    return { elapsed, errors };
}

function resetDFA() {
    // @ts-ignore - accessing private static
    const dfaArray: any[] = SysMLv2Parser['decisionsToDFA'];
    // @ts-ignore
    const atn = SysMLv2Parser['_ATN'];
    if (dfaArray && atn) {
        for (let i = 0; i < dfaArray.length; i++) {
            dfaArray[i] = new (dfaArray[i].constructor)(atn.decisionToState[i], i);
        }
    }
}

/** Split warmup text into chunks (same logic as parseWorker.ts) */
function createWarmupChunks(): string[] {
    const allLines = WARMUP_TEXT.split('\n');
    const inner = allLines.slice(1, allLines.length - 1);
    const CHUNK_SIZE = 30;
    const chunks: string[] = [];
    for (let i = 0; i < inner.length; i += CHUNK_SIZE) {
        const slice = inner.slice(i, i + CHUNK_SIZE).join('\n');
        chunks.push(`package WU_${chunks.length} {\n${slice}\n}`);
    }
    return chunks;
}

// Load the big test file
const bigFilePath = resolve(__dirname, '../../../examples/temp/SysML v2 Spec Annex A SimpleVehicleModel.sysml');
let bigFileText: string;
try {
    bigFileText = readFileSync(bigFilePath, 'utf-8');
} catch {
    console.log('No big file found, using warmup text');
    bigFileText = WARMUP_TEXT;
}

const chunks = createWarmupChunks();
console.log(`Warmup text: ${WARMUP_TEXT.length} chars, ${WARMUP_TEXT.split('\n').length} lines → ${chunks.length} chunks`);
console.log(`Big file:    ${bigFileText.length} chars, ${bigFileText.split('\n').length} lines`);
console.log('');

// Phase 1: Cold DFA — parse big file directly
console.log('=== Phase 1: Cold DFA — parse big file (SLL) ===');
const cold = parse(bigFileText, true);
console.log(`  Time: ${cold.elapsed.toFixed(0)}ms, errors: ${cold.errors}`);
resetDFA();

// Phase 2: Chunked warm-up with per-chunk timing
console.log('');
console.log(`=== Phase 2: Chunked warm-up (${chunks.length} chunks, SLL) ===`);
const chunkTimes: number[] = [];
const warmupStart = performance.now();
for (let i = 0; i < chunks.length; i++) {
    const t = performance.now();
    try { parse(chunks[i], true); } catch { }
    const elapsed = performance.now() - t;
    chunkTimes.push(elapsed);
    process.stdout.write(`  Chunk ${i.toString().padStart(2)}: ${elapsed.toFixed(0).padStart(6)}ms\n`);
}
const totalWarmup = performance.now() - warmupStart;
console.log(`  TOTAL warm-up: ${totalWarmup.toFixed(0)}ms`);
console.log(`  Max chunk:     ${Math.max(...chunkTimes).toFixed(0)}ms`);
console.log(`  Avg chunk:     ${(totalWarmup / chunks.length).toFixed(0)}ms`);

// Phase 3: Post-warmup big file parse
console.log('');
console.log('=== Phase 3: Post-warmup — parse big file (SLL) ===');
const postWarmup = parse(bigFileText, true);
console.log(`  Time: ${postWarmup.elapsed.toFixed(0)}ms, errors: ${postWarmup.errors}`);

// Phase 4: Fully warm parse
console.log('');
console.log('=== Phase 4: Second parse (fully warm DFA) ===');
const second = parse(bigFileText, true);
console.log(`  Time: ${second.elapsed.toFixed(0)}ms, errors: ${second.errors}`);

// Phase 5: Simulate user opens file after N chunks
console.log('');
console.log('=== Phase 5: "User opens file after N chunks" simulation ===');
for (const n of [0, 2, 5, 8]) {
    if (n > chunks.length) continue;
    resetDFA();
    // Parse N chunks
    for (let i = 0; i < n; i++) {
        try { parse(chunks[i], true); } catch { }
    }
    // Then parse big file
    const result = parse(bigFileText, true);
    const totalTime = chunkTimes.slice(0, n).reduce((a, b) => a + b, 0) + result.elapsed;
    console.log(`  After ${n.toString().padStart(2)} chunks: parse=${result.elapsed.toFixed(0)}ms, total=${totalTime.toFixed(0)}ms`);
}

console.log('');
console.log('=== Summary ===');
console.log(`  Cold DFA parse:        ${cold.elapsed.toFixed(0)}ms`);
console.log(`  Chunked warmup total:  ${totalWarmup.toFixed(0)}ms (max chunk: ${Math.max(...chunkTimes).toFixed(0)}ms)`);
console.log(`  Post-warmup parse:     ${postWarmup.elapsed.toFixed(0)}ms`);
console.log(`  Fully warm parse:      ${second.elapsed.toFixed(0)}ms`);
console.log(`  Speedup (cold→post):   ${(cold.elapsed / postWarmup.elapsed).toFixed(1)}x`);
