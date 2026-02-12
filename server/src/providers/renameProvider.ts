import {
    TextDocumentPositionParams,
    RenameParams,
    WorkspaceEdit,
    TextEdit,
    Range,
} from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { SymbolTable } from '../symbols/symbolTable.js';

/**
 * Provides symbol rename functionality.
 * Renames a symbol and updates all references within the document.
 */
export class RenameProvider {
    private symbolTable = new SymbolTable();

    constructor(private documentManager: DocumentManager) { }

    /**
     * Check if the token at position is renameable and return its range.
     */
    prepareRename(params: TextDocumentPositionParams): Range | null {
        const result = this.documentManager.get(params.textDocument.uri);
        if (!result) return null;

        const text = this.documentManager.getText(params.textDocument.uri);
        if (!text) return null;

        this.symbolTable.build(params.textDocument.uri, result);

        const symbol = this.symbolTable.resolveAt(
            params.textDocument.uri,
            params.position.line,
            params.position.character,
            text,
        );

        if (!symbol) return null;

        return symbol.selectionRange;
    }

    /**
     * Perform the rename — update the symbol and all references.
     */
    provideRename(params: RenameParams): WorkspaceEdit | null {
        const result = this.documentManager.get(params.textDocument.uri);
        if (!result) return null;

        const text = this.documentManager.getText(params.textDocument.uri);
        if (!text) return null;

        this.symbolTable.build(params.textDocument.uri, result);

        const symbol = this.symbolTable.resolveAt(
            params.textDocument.uri,
            params.position.line,
            params.position.character,
            text,
        );

        if (!symbol) return null;

        // Find all occurrences of this symbol name in the document text
        const edits: TextEdit[] = [];
        const oldName = symbol.name;
        const newName = params.newName;

        // Find all references by name match
        const references = this.symbolTable.findReferences(oldName);
        for (const ref of references) {
            if (ref.uri === params.textDocument.uri) {
                edits.push({
                    range: ref.selectionRange,
                    newText: newName,
                });
            }
        }

        // Also find text occurrences that might be type references
        const lines = text.split('\n');
        const wordRegex = new RegExp(`\\b${this.escapeRegex(oldName)}\\b`, 'g');
        for (let i = 0; i < lines.length; i++) {
            let match: RegExpExecArray | null;
            while ((match = wordRegex.exec(lines[i])) !== null) {
                const range: Range = {
                    start: { line: i, character: match.index },
                    end: { line: i, character: match.index + oldName.length },
                };
                // Avoid duplicates from symbol table
                if (!edits.some(e => e.range.start.line === i && e.range.start.character === match!.index)) {
                    edits.push({ range, newText: newName });
                }
            }
        }

        if (edits.length === 0) return null;

        return {
            changes: {
                [params.textDocument.uri]: edits,
            },
        };
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
