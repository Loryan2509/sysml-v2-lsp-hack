import {
    CallHierarchyItem,
    CallHierarchyIncomingCall,
    CallHierarchyOutgoingCall,
    CallHierarchyIncomingCallsParams,
    CallHierarchyOutgoingCallsParams,
    CallHierarchyPrepareParams,
    SymbolKind,
    Range,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
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
 * Provides call hierarchy for SysML actions.
 *
 * Maps SysML concepts to call hierarchy:
 *  - "Calls" = perform, include (an action invoking other actions)
 *  - "Called by" = which actions perform/include this one
 */
export class CallHierarchyProvider {
    private symbolTable = new SymbolTable();

    constructor(
        private documentManager: DocumentManager,
        private documents: TextDocuments<TextDocument>,
    ) { }

    prepareCallHierarchy(params: CallHierarchyPrepareParams): CallHierarchyItem[] | null {
        const uri = params.textDocument.uri;
        const result = this.documentManager.get(uri);
        if (!result) return null;

        const text = this.documentManager.getText(uri);

        this.symbolTable.build(uri, result);

        const symbol = text
            ? this.symbolTable.resolveAt(uri, params.position.line, params.position.character, text)
            : this.symbolTable.findSymbolAtPosition(uri, params.position.line, params.position.character);
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

        // Search all documents for references to this action
        for (const uri of this.documentManager.getUris()) {
            const doc = this.documents.get(uri);
            if (!doc) continue;

            const text = doc.getText();
            const symbols = this.symbolTable.getSymbolsForUri(uri);

            // Look for `perform <name>` or `include <name>` patterns
            for (const keyword of CALL_KEYWORDS) {
                const regex = new RegExp(`\\b${keyword}\\s+${this.escapeRegex(targetName)}\\b`, 'g');
                let match: RegExpExecArray | null;

                while ((match = regex.exec(text)) !== null) {
                    // Find the enclosing action/state for this reference
                    const pos = doc.positionAt(match.index);
                    const enclosing = this.findEnclosingBehavioral(symbols, pos.line);

                    if (enclosing) {
                        const fromRange = Range.create(
                            doc.positionAt(match.index),
                            doc.positionAt(match.index + match[0].length),
                        );

                        incoming.push({
                            from: this.toCallHierarchyItem(enclosing),
                            fromRanges: [fromRange],
                        });
                    }
                }
            }
        }

        return incoming;
    }

    provideOutgoingCalls(params: CallHierarchyOutgoingCallsParams): CallHierarchyOutgoingCall[] {
        const item = params.item;
        this.buildAllSymbols();

        const doc = this.documents.get(item.uri);
        if (!doc) return [];

        const text = doc.getText();
        const outgoing: CallHierarchyOutgoingCall[] = [];

        // Find the symbol body range
        const symbols = this.symbolTable.getSymbolsForUri(item.uri);
        const sym = symbols.find(s =>
            s.name === item.name &&
            s.selectionRange.start.line === item.selectionRange.start.line
        );
        if (!sym) return [];

        // Search within the symbol's range for call-keywords
        const startOffset = doc.offsetAt(sym.range.start);
        const endOffset = doc.offsetAt(sym.range.end);
        const bodyText = text.slice(startOffset, endOffset);

        for (const keyword of CALL_KEYWORDS) {
            const regex = new RegExp(`\\b${keyword}\\s+(\\w+)`, 'g');
            let match: RegExpExecArray | null;

            while ((match = regex.exec(bodyText)) !== null) {
                const calledName = match[1];
                const targets = this.symbolTable.findByName(calledName);

                if (targets.length > 0) {
                    const absOffset = startOffset + match.index;
                    const fromRange = Range.create(
                        doc.positionAt(absOffset),
                        doc.positionAt(absOffset + match[0].length),
                    );

                    outgoing.push({
                        to: this.toCallHierarchyItem(targets[0]),
                        fromRanges: [fromRange],
                    });
                }
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

    private findEnclosingBehavioral(symbols: SysMLSymbol[], line: number): SysMLSymbol | undefined {
        let best: SysMLSymbol | undefined;
        let bestSize = Infinity;

        for (const sym of symbols) {
            const r = sym.range;
            if (line >= r.start.line && line <= r.end.line) {
                const size = r.end.line - r.start.line;
                if (size < bestSize) {
                    best = sym;
                    bestSize = size;
                }
            }
        }
        return best;
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
