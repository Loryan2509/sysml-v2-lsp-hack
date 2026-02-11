import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument, ParseResult } from './parser/parseDocument.js';

/**
 * Manages parsed documents — caches parse results by URI and content hash.
 * Re-parses only when the document content has changed.
 */
export class DocumentManager {
    private cache = new Map<string, CachedDocument>();

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
     * Get the cached parse result for a URI, or undefined if not cached.
     */
    get(uri: string): ParseResult | undefined {
        return this.cache.get(uri)?.result;
    }

    /**
     * Get the cached text for a URI.
     */
    getText(uri: string): string | undefined {
        return this.cache.get(uri)?.text;
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
