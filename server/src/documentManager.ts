import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import { parseDocument, ParseResult } from './parser/parseDocument.js';

/**
 * Manages parsed documents — caches parse results by URI and content hash.
 * Re-parses only when the document content has changed.
 *
 * The DocumentManager can be wired to the LSP `TextDocuments` collection so
 * that providers which call `get(uri)` or `getText(uri)` trigger a lazy
 * main-thread parse if no cached result is available yet.  This avoids
 * a second cold parse because the ANTLR DFA will already be warm from
 * the worker-thread parse that ran during validation.
 */
export class DocumentManager {
    private cache = new Map<string, CachedDocument>();
    private documents?: TextDocuments<TextDocument>;

    /**
     * Wire the manager to the LSP TextDocuments collection so it can
     * lazily parse open documents when providers request them.
     */
    setDocuments(documents: TextDocuments<TextDocument>): void {
        this.documents = documents;
    }

    /**
     * Parse a document and cache the result.
     * Returns the cached result if the content hasn't changed.
     */
    parse(document: TextDocument): ParseResult {
        const uri = document.uri;
        const version = document.version;
        const cached = this.cache.get(uri);

        if (cached && cached.version === version) {
            return cached.result;
        }

        const text = document.getText();
        const result = parseDocument(text);

        this.cache.set(uri, {
            version,
            text,
            result,
        });

        return result;
    }

    /**
     * Get the cached parse result for a URI.
     * If no result is cached but the document is open, performs a lazy
     * main-thread parse (fast when the DFA is already warm from the worker).
     */
    get(uri: string): ParseResult | undefined {
        const cached = this.cache.get(uri);
        if (cached) return cached.result;

        // Lazy parse — the document is open but hasn't been parsed on the
        // main thread yet (the worker parsed it for diagnostics/semantic tokens).
        if (this.documents) {
            const doc = this.documents.get(uri);
            if (doc) {
                return this.parse(doc);
            }
        }

        return undefined;
    }

    /**
     * Get the cached text for a URI.
     * Falls back to the live TextDocument content if available.
     */
    getText(uri: string): string | undefined {
        const cached = this.cache.get(uri);
        if (cached) return cached.text;

        if (this.documents) {
            const doc = this.documents.get(uri);
            if (doc) return doc.getText();
        }

        return undefined;
    }

    /**
     * Remove a document from the cache (called on document close).
     */
    remove(uri: string): void {
        this.cache.delete(uri);
    }

    /**
     * Get all cached URIs.
     */
    getUris(): string[] {
        return Array.from(this.cache.keys());
    }
}

interface CachedDocument {
    version: number;
    text: string;
    result: ParseResult;
}
