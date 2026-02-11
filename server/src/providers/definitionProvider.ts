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

    constructor(private documentManager: DocumentManager) {}

    provideDefinition(params: DefinitionParams): Location | null {
        const result = this.documentManager.get(params.textDocument.uri);
        if (!result) {
            return null;
        }

        // Build symbol table
        this.symbolTable.build(params.textDocument.uri, result);

        // Find what's at the cursor
        const symbol = this.symbolTable.findSymbolAtPosition(
            params.textDocument.uri,
            params.position.line,
            params.position.character,
        );

        if (!symbol) {
            // Try looking up by word at position
            const text = this.documentManager.getText(params.textDocument.uri);
            if (!text) return null;

            const word = this.getWordAtPosition(text, params.position.line, params.position.character);
            if (!word) return null;

            // Search for a matching symbol by name
            const matches = this.symbolTable.findByName(word);
            if (matches.length > 0) {
                return {
                    uri: matches[0].uri,
                    range: matches[0].selectionRange,
                };
            }
            return null;
        }

        // If the symbol has a type, try to navigate to the type definition
        if (symbol.typeName) {
            const typeMatches = this.symbolTable.findByName(symbol.typeName);
            if (typeMatches.length > 0) {
                return {
                    uri: typeMatches[0].uri,
                    range: typeMatches[0].selectionRange,
                };
            }
        }

        return {
            uri: symbol.uri,
            range: symbol.selectionRange,
        };
    }

    private getWordAtPosition(text: string, line: number, character: number): string | undefined {
        const lines = text.split('\n');
        if (line >= lines.length) return undefined;

        const lineText = lines[line];
        if (character >= lineText.length) return undefined;

        // Find word boundaries
        const wordPattern = /[a-zA-Z_]\w*/g;
        let match: RegExpExecArray | null;
        while ((match = wordPattern.exec(lineText)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (character >= start && character <= end) {
                return match[0];
            }
        }

        return undefined;
    }
}
