import {
    Hover,
    MarkupContent,
    MarkupKind,
    TextDocumentPositionParams,
} from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { getLibraryHoverInfo } from '../library/libraryIndex.js';
import { toMetaclassName } from '../symbols/sysmlElements.js';
import { extractQualifiedNameAt } from '../utils/identUtils.js';

/**
 * Provides hover information for SysML elements.
 * Shows element kind, type, and documentation on hover.
 */
export class HoverProvider {

    constructor(private documentManager: DocumentManager) { }

    provideHover(params: TextDocumentPositionParams): Hover | null {
        const symbolTable = this.documentManager.getSymbolTable(params.textDocument.uri);
        if (!symbolTable) {
            return null;
        }

        // Try to extract the word at hover position (for qualified name lookup)
        const text = this.documentManager.getText(params.textDocument.uri);
        const word = text
            ? this.getWordAtPosition(text, params.position.line, params.position.character)
            : undefined;

        // For qualified names (e.g. ISQ::mass), check the standard
        // library first — the qualifier strongly suggests a library ref
        if (word && word.includes('::')) {
            const libHover = this.buildLibraryHover(word);
            if (libHover) return libHover;
        }

        // Find symbol at hover position
        const symbol = symbolTable.findSymbolAtPosition(
            params.textDocument.uri,
            params.position.line,
            params.position.character,
        );

        if (!symbol) {
            // No local symbol — try unqualified library lookup for
            // the plain word
            if (word) {
                const libHover = this.buildLibraryHover(word);
                if (libHover) return libHover;
            }
            return null;
        }

        // Build hover content
        const lines: string[] = [];

        // Header: metaclass name and symbol name
        const metaclass = toMetaclassName(symbol.kind);
        lines.push(`**${metaclass}** \`${symbol.name}\``);

        // Qualified name
        if (symbol.qualifiedName !== symbol.name) {
            lines.push(`\nFully qualified: \`${symbol.qualifiedName}\``);
        }

        // Type info — also enrich with library info when available
        if (symbol.typeName) {
            lines.push(`\nType: \`${symbol.typeName}\``);

            // If the type is a library type, show its declaration
            const libInfo = getLibraryHoverInfo(symbol.typeName);
            if (libInfo) {
                if (libInfo.packageName) {
                    lines.push(`\nFrom: \`${libInfo.packageName}\``);
                }
                lines.push(`\n\`\`\`sysml\n${libInfo.declaration}\n\`\`\``);
                if (libInfo.documentation) {
                    lines.push(`\n${libInfo.documentation}`);
                }
            }
        }

        // Documentation from the local symbol
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

    /**
     * Build a hover result from the standard library for a name.
     */
    private buildLibraryHover(name: string): Hover | null {
        const info = getLibraryHoverInfo(name);
        if (!info) return null;

        const lines: string[] = [];

        // Header with package context
        const displayName = name.includes('::')
            ? name
            : (info.packageName ? `${info.packageName}::${name}` : name);
        lines.push(`**Standard Library** \`${displayName}\``);

        // Declaration
        lines.push(`\n\`\`\`sysml\n${info.declaration}\n\`\`\``);

        if (info.packageName) {
            lines.push(`\nPackage: \`${info.packageName}\``);
        }

        // Documentation (ISO reference, etc.)
        if (info.documentation) {
            lines.push(`\n---\n${info.documentation}`);
        }

        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: lines.join('\n'),
            },
        };
    }

    /**
     * Extract the word (simple or qualified) at a text position.
     * Scans for identifier segments separated by '::' without regex.
     */
    private getWordAtPosition(text: string, line: number, character: number): string | undefined {
        const lines = text.split('\n');
        if (line >= lines.length) return undefined;

        const lineText = lines[line];
        if (character >= lineText.length) return undefined;

        return extractQualifiedNameAt(lineText, character);
    }
}


