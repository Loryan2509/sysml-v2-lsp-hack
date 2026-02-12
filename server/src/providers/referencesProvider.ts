import {
    ReferenceParams,
    Location,
} from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { SymbolTable } from '../symbols/symbolTable.js';

/**
 * Provides find-all-references for SysML elements.
 */
export class ReferencesProvider {
    private symbolTable = new SymbolTable();

    constructor(private documentManager: DocumentManager) { }

    provideReferences(params: ReferenceParams): Location[] {
        const result = this.documentManager.get(params.textDocument.uri);
        if (!result) {
            return [];
        }

        const text = this.documentManager.getText(params.textDocument.uri);
        if (!text) return [];

        // Build symbol table
        this.symbolTable.build(params.textDocument.uri, result);

        // Find symbol at position (declaration or reference)
        const symbol = this.symbolTable.resolveAt(
            params.textDocument.uri,
            params.position.line,
            params.position.character,
            text,
        );

        if (!symbol) {
            return [];
        }

        // Find all references
        const references = this.symbolTable.findReferences(symbol.name);
        const locations: Location[] = [];

        for (const ref of references) {
            locations.push({
                uri: ref.uri,
                range: ref.selectionRange,
            });
        }

        // Include the definition itself if requested
        if (params.context.includeDeclaration) {
            // Already included through findReferences
        }

        return locations;
    }
}
