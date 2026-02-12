import {
    DocumentLink,
    DocumentLinkParams,
    Range,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { SymbolTable } from '../symbols/symbolTable.js';

/**
 * Regex to match SysML import statements.
 *
 * Captures:
 *  - group 1: the qualified name path (e.g., "Camera::Optics" or "Lib::*")
 *
 * Handles:
 *  - `import Camera::Optics;`
 *  - `import Camera::Optics::*;`
 *  - `import Camera::*;`
 *  - multi-line is unlikely for imports but the `m` flag handles it
 */
const IMPORT_REGEX = /\bimport\s+([\w]+(?:::[\w*]+)*)\s*;/gm;

/**
 * Provides clickable document links for `import` statements.
 *
 * Turns `import Camera::Optics;` into a clickable link that
 * jumps to the definition of `Camera` or `Camera::Optics`.
 */
export class DocumentLinkProvider {
    private symbolTable = new SymbolTable();

    constructor(
        private documentManager: DocumentManager,
        private documents: TextDocuments<TextDocument>,
    ) { }

    provideDocumentLinks(params: DocumentLinkParams): DocumentLink[] {
        const uri = params.textDocument.uri;
        const doc = this.documents.get(uri);
        if (!doc) return [];

        const text = doc.getText();
        const links: DocumentLink[] = [];

        // Build symbol tables for all known documents so we can resolve cross-file
        for (const knownUri of this.documentManager.getUris()) {
            const result = this.documentManager.get(knownUri);
            if (result) {
                this.symbolTable.build(knownUri, result);
            }
        }

        // Find all import statements in the text
        let match: RegExpExecArray | null;
        IMPORT_REGEX.lastIndex = 0;

        while ((match = IMPORT_REGEX.exec(text)) !== null) {
            const importPath = match[1];

            // Calculate position of just the namespace path (not the `import` keyword)
            const importKeywordLen = 'import '.length;
            const pathStart = match.index + importKeywordLen;
            const pathEnd = pathStart + importPath.length;

            const startPos = doc.positionAt(pathStart);
            const endPos = doc.positionAt(pathEnd);

            // Try to resolve the import to a symbol
            // Strip trailing ::* for lookup
            const lookupName = importPath.replace(/::?\*$/, '');
            const target = this.resolveImportTarget(lookupName);

            if (target) {
                links.push({
                    range: Range.create(startPos, endPos),
                    target: target.uri,
                    tooltip: `Go to ${lookupName}`,
                });
            } else {
                // Still create a link even if unresolved — shows it's meant to be navigable
                links.push({
                    range: Range.create(startPos, endPos),
                    tooltip: `${lookupName} (unresolved)`,
                });
            }
        }

        return links;
    }

    private resolveImportTarget(qualifiedName: string): { uri: string } | undefined {
        // Try exact qualified name first
        const exact = this.symbolTable.getSymbol(qualifiedName);
        if (exact) return { uri: exact.uri };

        // Try the first segment as a simple name
        const firstSegment = qualifiedName.split('::')[0];
        const matches = this.symbolTable.findByName(firstSegment);
        if (matches.length > 0) return { uri: matches[0].uri };

        return undefined;
    }
}
