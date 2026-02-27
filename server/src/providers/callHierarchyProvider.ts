import {
    CallHierarchyItem,
    CallHierarchyIncomingCall,
    CallHierarchyOutgoingCall,
    CallHierarchyIncomingCallsParams,
    CallHierarchyOutgoingCallsParams,
    CallHierarchyPrepareParams,
    SymbolKind,
    Range,
    Position,
} from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { SymbolTable } from '../symbols/symbolTable.js';
import { SysMLElementKind, SysMLSymbol } from '../symbols/sysmlElements.js';

/**
 * Action-related keywords that create "call" relationships in SysML.
 */
const CALL_KEYWORDS = new Set([
    'perform', 'include', 'accept', 'send', 'assign', 'assert',
]);

/**
 * Keywords whose typed usages (`action x : TypeDef`) represent calls.
 */
const USAGE_KEYWORDS = ['action', 'state', 'calc'];
const USAGE_PATTERN = `(?:${USAGE_KEYWORDS.join('|')})`;

/** Convert a text offset to a Position. */
function offsetToPosition(text: string, offset: number): Position {
    let line = 0;
    let character = 0;
    for (let i = 0; i < offset && i < text.length; i++) {
        if (text[i] === '\n') {
            line++;
            character = 0;
        } else {
            character++;
        }
    }
    return Position.create(line, character);
}

/** Convert a Position to a text offset. */
function positionToOffset(text: string, pos: Position): number {
    let currentLine = 0;
    for (let i = 0; i < text.length; i++) {
        if (currentLine === pos.line) {
            return i + pos.character;
        }
        if (text[i] === '\n') {
            currentLine++;
        }
    }
    return text.length;
}

/**
 * Provides call hierarchy for SysML actions.
 *
 * Maps SysML concepts to call hierarchy:
 *  - "Calls" = perform, include, accept (explicit keywords)
 *  - "Calls" = `action x : ActionDef` (typed usage = composition call)
 *  - "Called by" = which actions perform/include/compose this one
 */
export class CallHierarchyProvider {
    private symbolTable = new SymbolTable();

    constructor(private documentManager: DocumentManager) { }

    prepareCallHierarchy(params: CallHierarchyPrepareParams): CallHierarchyItem[] | null {
        const uri = params.textDocument.uri;
        const result = this.documentManager.get(uri);
        if (!result) return null;

        this.symbolTable.build(uri, result);

        const symbol = this.symbolTable.findSymbolAtPosition(uri, params.position.line, params.position.character);
        if (!symbol) return null;

        // Call hierarchy makes sense for actions, states, and similar behavioral elements
        const behavioral = new Set([
            SysMLElementKind.ActionDef, SysMLElementKind.ActionUsage,
            SysMLElementKind.StateDef, SysMLElementKind.StateUsage,
            SysMLElementKind.CalcDef, SysMLElementKind.CalcUsage,
            SysMLElementKind.UseCaseDef, SysMLElementKind.UseCaseUsage,
        ]);

        if (!behavioral.has(symbol.kind)) return null;

        return [this.toCallHierarchyItem(symbol)];
    }

    provideIncomingCalls(params: CallHierarchyIncomingCallsParams): CallHierarchyIncomingCall[] {
        this.buildAllSymbols();
        const item = params.item;
        const targetName = item.name;
        const incoming: CallHierarchyIncomingCall[] = [];

        for (const uri of this.documentManager.getUris()) {
            const text = this.documentManager.getText(uri);
            if (!text) continue;

            const symbols = this.symbolTable.getSymbolsForUri(uri);

            // 1. Explicit call keywords: `perform Brake`, `accept Accelerate`, etc.
            for (const keyword of CALL_KEYWORDS) {
                const regex = new RegExp(`\\b${keyword}\\s+${this.escapeRegex(targetName)}\\b`, 'g');
                let match: RegExpExecArray | null;

                while ((match = regex.exec(text)) !== null) {
                    const pos = offsetToPosition(text, match.index);
                    const enclosing = this.findEnclosingBehavioral(symbols, pos.line);

                    if (enclosing) {
                        incoming.push({
                            from: this.toCallHierarchyItem(enclosing),
                            fromRanges: [Range.create(
                                pos,
                                offsetToPosition(text, match.index + match[0].length),
                            )],
                        });
                    }
                }
            }

            // 2. Typed usages: `action foo : TargetName` — composition is a call.
            //    skip=1 because the narrowest enclosing behavioral is the usage
            //    itself; the actual *caller* is the parent action/state.
            const usageRegex = new RegExp(
                `\\b${USAGE_PATTERN}\\s+\\w+\\s*:\\s*${this.escapeRegex(targetName)}\\b`, 'g',
            );
            let match: RegExpExecArray | null;
            while ((match = usageRegex.exec(text)) !== null) {
                const pos = offsetToPosition(text, match.index);
                const enclosing = this.findEnclosingBehavioral(symbols, pos.line, 1);
                if (enclosing) {
                    incoming.push({
                        from: this.toCallHierarchyItem(enclosing),
                        fromRanges: [Range.create(
                            pos,
                            offsetToPosition(text, match.index + match[0].length),
                        )],
                    });
                }
            }
        }

        return incoming;
    }

    provideOutgoingCalls(params: CallHierarchyOutgoingCallsParams): CallHierarchyOutgoingCall[] {
        const item = params.item;
        this.buildAllSymbols();

        const fullText = this.documentManager.getText(item.uri);
        if (!fullText) return [];

        const outgoing: CallHierarchyOutgoingCall[] = [];

        // Find the symbol body range
        const symbols = this.symbolTable.getSymbolsForUri(item.uri);
        const sym = symbols.find(s =>
            s.name === item.name &&
            s.selectionRange.start.line === item.selectionRange.start.line
        );
        if (!sym) return [];

        const startOffset = positionToOffset(fullText, sym.range.start);
        const endOffset = positionToOffset(fullText, sym.range.end);
        const bodyText = fullText.slice(startOffset, endOffset);

        // 1. Explicit call keywords: `perform Brake`, `accept Accelerate`, etc.
        for (const keyword of CALL_KEYWORDS) {
            const regex = new RegExp(`\\b${keyword}\\s+(\\w+)`, 'g');
            let match: RegExpExecArray | null;

            while ((match = regex.exec(bodyText)) !== null) {
                const calledName = match[1];
                const targets = this.symbolTable.findByName(calledName);

                if (targets.length > 0) {
                    const absOffset = startOffset + match.index;
                    outgoing.push({
                        to: this.toCallHierarchyItem(targets[0]),
                        fromRanges: [Range.create(
                            offsetToPosition(fullText, absOffset),
                            offsetToPosition(fullText, absOffset + match[0].length),
                        )],
                    });
                }
            }
        }

        // 2. Typed usages: `action foo : TypeDef` — composition is a call
        const usageRegex = new RegExp(
            `\\b${USAGE_PATTERN}\\s+\\w+\\s*:\\s*(\\w+)`, 'g',
        );
        let match: RegExpExecArray | null;
        while ((match = usageRegex.exec(bodyText)) !== null) {
            const calledName = match[1];
            const targets = this.symbolTable.findByName(calledName);
            if (targets.length > 0) {
                const absOffset = startOffset + match.index;
                outgoing.push({
                    to: this.toCallHierarchyItem(targets[0]),
                    fromRanges: [Range.create(
                        offsetToPosition(fullText, absOffset),
                        offsetToPosition(fullText, absOffset + match[0].length),
                    )],
                });
            }
        }

        return outgoing;
    }

    private buildAllSymbols(): void {
        for (const uri of this.documentManager.getUris()) {
            const result = this.documentManager.get(uri);
            if (result) {
                this.symbolTable.build(uri, result);
            }
        }
    }

    private findEnclosingBehavioral(symbols: SysMLSymbol[], line: number, skip = 0): SysMLSymbol | undefined {
        const candidates: { sym: SysMLSymbol; size: number }[] = [];

        for (const sym of symbols) {
            const r = sym.range;
            if (line >= r.start.line && line <= r.end.line) {
                candidates.push({ sym, size: r.end.line - r.start.line });
            }
        }

        candidates.sort((a, b) => a.size - b.size);
        return candidates[skip]?.sym;
    }

    private toCallHierarchyItem(sym: SysMLSymbol): CallHierarchyItem {
        return {
            name: sym.name,
            kind: sym.kind.includes('action') ? SymbolKind.Method
                : sym.kind.includes('state') ? SymbolKind.Enum
                    : sym.kind.includes('calc') ? SymbolKind.Function
                        : SymbolKind.Event,
            uri: sym.uri,
            range: sym.range,
            selectionRange: sym.selectionRange,
            detail: sym.kind,
        };
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
