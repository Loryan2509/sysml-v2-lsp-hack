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

        // Build symbol table for the current file
        this.symbolTable.build(params.textDocument.uri, result);

        // Find symbol at position
        const symbol = this.symbolTable.findSymbolAtPosition(
            params.textDocument.uri,
            params.position.line,
            params.position.character,
        );

        if (!symbol) {
            return [];
        }

        // Build symbol tables for all other known documents to find cross-file references
        const allUris = this.documentManager.getUris();
        for (const uri of allUris) {
            if (uri === params.textDocument.uri) continue;
            const otherResult = this.documentManager.get(uri);
            if (otherResult) {
                this.symbolTable.build(uri, otherResult);
            }
        }

        // Find all references across all files
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
