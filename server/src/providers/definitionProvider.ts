import {
    DefinitionParams,
    Location,
} from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { resolveLibraryType } from '../library/libraryIndex.js';
import { SymbolTable } from '../symbols/symbolTable.js';

/**
 * Provides go-to-definition for SysML elements.
 * Resolves symbol at cursor → jumps to its declaration.
 * Falls back to standard library type definitions when no
 * local definition is found.
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

            // Search for a matching symbol by name in the document
            const matches = this.symbolTable.findByName(word);
            if (matches.length > 0) {
                return {
                    uri: matches[0].uri,
                    range: matches[0].selectionRange,
                };
            }

            // For qualified names (e.g. ISQ::mass), also try the
            // member part against the local symbol table
            if (word.includes('::')) {
                const member = word.split('::').pop()!;
                const memberMatches = this.symbolTable.findByName(member);
                if (memberMatches.length > 0) {
                    return {
                        uri: memberMatches[0].uri,
                        range: memberMatches[0].selectionRange,
                    };
                }
            }

            // Fall back to the standard library (tries both qualified
            // and unqualified forms)
            return this.resolveFromLibrary(word);
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

            // Fall back to the standard library for the type
            const libLoc = this.resolveFromLibrary(symbol.typeName);
            if (libLoc) return libLoc;
        }

        return {
            uri: symbol.uri,
            range: symbol.selectionRange,
        };
    }

    /**
     * Resolve a name against the bundled SysML standard library.
     * Returns a Location pointing to the `.kerml` / `.sysml` file
     * and line where the type is declared, or `null`.
     */
    private resolveFromLibrary(name: string): Location | null {
        const loc = resolveLibraryType(name);
        if (!loc) return null;
        return {
            uri: loc.uri,
            range: {
                start: { line: loc.line, character: 0 },
                end: { line: loc.line, character: 0 },
            },
        };
    }

    private getWordAtPosition(text: string, line: number, character: number): string | undefined {
        const lines = text.split('\n');
        if (line >= lines.length) return undefined;

        const lineText = lines[line];
        if (character >= lineText.length) return undefined;

        // First try to match qualified names (e.g. ISQ::mass, Pkg::Type)
        const qualifiedPattern = /[a-zA-Z_]\w*(?:::[a-zA-Z_]\w*)*/g;
        let match: RegExpExecArray | null;
        while ((match = qualifiedPattern.exec(lineText)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (character >= start && character <= end) {
                return match[0];
            }
        }

        return undefined;
    }
}
