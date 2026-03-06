/**
 * DFA Loader — pre-populates the ANTLR4 parser's static DFA tables
 * from a build-time snapshot, eliminating the ~17 s cold-start penalty.
 *
 * The loader creates DFAState objects (with an empty ATNConfigSet as a
 * safety fallback) and wires up the edge graph.  The parser's fast path
 * (`getExistingTargetState`) only reads `state.edges[token + 1]`, so
 * pre-populated edges work perfectly.
 *
 * If the parser encounters a token sequence not covered by the snapshot,
 * `computeReachSet` iterates over the empty ATNConfigSet, finds nothing,
 * returns null, and an ERROR edge is added.  The parse wrapper in
 * `parseDocument.ts` detects these errors and clears the DFA so the next
 * parse rebuilds transitions from the ATN.
 */

import { ATNConfigSet, ATNSimulator, DFAState } from 'antlr4ng';
import { SysMLv2Parser } from '../generated/SysMLv2Parser.js';
import { DFA_SNAPSHOT, type DecisionSnapshot } from './dfaSnapshot.js';

/** Sentinel: set to true after loadDFASnapshot() succeeds. */
let _loaded = false;

/** Returns true if the DFA has been pre-seeded from a snapshot. */
export function isDfaPreSeeded(): boolean {
    return _loaded;
}

/**
 * Clear all pre-seeded DFA states, reverting to empty tables.
 * Called when a pre-seeded state triggers a TypeError (unseen edge).
 * After clearing, the next parse will rebuild the DFA from the ATN
 * normally (~17 s one-time cost).
 */
export function clearPreSeededDFA(): void {
    if (!_loaded) return;
    const dfas = (SysMLv2Parser as any).decisionsToDFA as any[];
    for (const dfa of dfas) {
        if (dfa.isPrecedenceDfa) {
            // Reset precedence DFA — re-create s0 with empty edges
            dfa.s0 = DFAState.fromState(-1);
        } else {
            dfa.s0 = undefined;
        }
        // Clear the internal states Map
        if (dfa.states && typeof dfa.states.clear === 'function') {
            dfa.states.clear();
        }
    }
    _loaded = false;
}

/**
 * Pre-populate the parser's static DFA tables from the build-time snapshot.
 *
 * Must be called once at server startup, before any parsing occurs.
 * Accesses `SysMLv2Parser._ATN` (triggers ATN deserialization if needed)
 * and writes directly to the shared `decisionsToDFA` array.
 *
 * @returns The number of DFA states loaded.
 */
export function loadDFASnapshot(): number {
    if (_loaded) return 0;

    // Trigger ATN initialisation (idempotent)
    void SysMLv2Parser._ATN;

    const dfas = (SysMLv2Parser as any).decisionsToDFA as any[];
    let totalStates = 0;

    for (const snap of DFA_SNAPSHOT) {
        loadDecision(dfas, snap);
        totalStates += snap.s.length;
    }

    _loaded = true;
    return totalStates;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function loadDecision(dfas: any[], snap: DecisionSnapshot): void {
    const dfa = dfas[snap.d];
    if (!dfa) return;

    // Shared empty ATNConfigSet — used as a safety net for all pre-seeded
    // states.  If the parser hits an edge not in the snapshot, computeReachSet
    // iterates over this empty set, finds nothing, returns null, and an ERROR
    // edge is added.  The parser then handles the error via its error strategy.
    const emptyConfigs = new ATNConfigSet();

    // Create all DFAState objects (with empty configs as safety fallback)
    const states: any[] = new Array(snap.s.length);
    for (let i = 0; i < snap.s.length; i++) {
        const ss = snap.s[i];
        const state = DFAState.fromState(i);
        (state as any).configs = emptyConfigs;
        state.isAcceptState = ss.a === 1;
        if (ss.p !== undefined) {
            state.prediction = ss.p;
        }
        state.requiresFullContext = ss.r === 1;
        states[i] = state;
    }

    // Wire up edges (token-indexed)
    // Target index -1 is the ERROR sentinel (ATNSimulator.ERROR)
    const errorState = (ATNSimulator as any).ERROR;
    for (let i = 0; i < snap.s.length; i++) {
        const ss = snap.s[i];
        const state = states[i];
        const e = ss.e;
        for (let j = 0; j < e.length; j += 2) {
            const tokenIndex = e[j];
            const targetIdx = e[j + 1];
            state.edges[tokenIndex] = targetIdx === -1 ? errorState : states[targetIdx];
        }
    }

    // Set s0
    if (snap.prec) {
        // Precedence DFA: s0 is a special state whose edges are indexed
        // by precedence value.  We keep the existing s0 (created by the
        // DFA constructor) and just populate its precedence edges.
        if (!dfa.s0) {
            dfa.s0 = DFAState.fromState(-1);
        }
        if (snap.precEdges) {
            const pe = snap.precEdges;
            for (let j = 0; j < pe.length; j += 2) {
                const precedence = pe[j];
                const stateIdx = pe[j + 1];
                dfa.s0.edges[precedence] = states[stateIdx];
            }
        }
    } else {
        dfa.s0 = states[snap.s0];
    }
}
