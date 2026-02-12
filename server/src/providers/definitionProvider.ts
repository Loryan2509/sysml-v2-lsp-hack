import {
    DefinitionParams,
    Location,
} from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { SymbolTable } from '../symbols/symbolTable.js';

/**
 * Provides go-to-definition for SysML elements.
 * Resolves symbol at cursor → jumps to its declaration.
 */
export class DefinitionProvider {
    private symbolTable = new SymbolTable();

    constructor(private documentManager: DocumentManager) { }

    provideDefinition(params: DefinitionParams): Location | null {
        const result = this.documentManager.get(params.textDocument.uri);
        if (!result) {
            return null;
        }

        const text = this.documentManager.getText(params.textDocument.uri);
        if (!text) return null;

        // Build symbol table
        this.symbolTable.build(params.textDocument.uri, result);

        // First try direct declaration at cursor
        const directSymbol = this.symbolTable.findSymbolAtPosition(
            params.textDocument.uri,
            params.position.line,
            params.position.character,
        );

        if (directSymbol) {
            // If the symbol has a type, navigate to the type definition
            if (directSymbol.typeName) {
                const typeMatches = this.symbolTable.findByName(directSymbol.typeName);
                if (typeMatches.length > 0) {
                    return {
                        uri: typeMatches[0].uri,
                        range: typeMatches[0].selectionRange,
                    };
                }
            }
            // Otherwise navigate to itself (already at definition)
            return {
                uri: directSymbol.uri,
                range: directSymbol.selectionRange,
            };
        }

        // Fallback: resolve the word under the cursor as a reference
        const symbol = this.symbolTable.resolveAt(
            params.textDocument.uri,
            params.position.line,
            params.position.character,
            text,
        );

        if (symbol) {
            return {
                uri: symbol.uri,
                range: symbol.selectionRange,
            };
        }

        return null;
    }
}
