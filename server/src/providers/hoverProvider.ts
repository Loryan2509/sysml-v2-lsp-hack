import {
    TextDocumentPositionParams,
    Hover,
    MarkupContent,
    MarkupKind,
} from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { SymbolTable } from '../symbols/symbolTable.js';
import { SysMLElementKind, isDefinition } from '../symbols/sysmlElements.js';

/**
 * Provides hover information for SysML elements.
 * Shows element kind, type, and documentation on hover.
 */
export class HoverProvider {
    private symbolTable = new SymbolTable();

    constructor(private documentManager: DocumentManager) {}

    provideHover(params: TextDocumentPositionParams): Hover | null {
        const result = this.documentManager.get(params.textDocument.uri);
        if (!result) {
            return null;
        }

        // Build symbol table for this document
        this.symbolTable.build(params.textDocument.uri, result);

        // Find symbol at hover position
        const symbol = this.symbolTable.findSymbolAtPosition(
            params.textDocument.uri,
            params.position.line,
            params.position.character,
        );

        if (!symbol) {
            return null;
        }

        // Build hover content
        const lines: string[] = [];

        // Header: kind and name
        const kindLabel = symbol.kind;
        lines.push(`**${kindLabel}** \`${symbol.name}\``);

        // Qualified name
        if (symbol.qualifiedName !== symbol.name) {
            lines.push(`\nFully qualified: \`${symbol.qualifiedName}\``);
        }

        // Type info
        if (symbol.typeName) {
            lines.push(`\nType: \`${symbol.typeName}\``);
        }

        // Documentation
        if (symbol.documentation) {
            lines.push(`\n---\n${symbol.documentation}`);
        }

        const content: MarkupContent = {
            kind: MarkupKind.Markdown,
            value: lines.join('\n'),
        };

        return {
            contents: content,
            range: symbol.selectionRange,
        };
    }
}
