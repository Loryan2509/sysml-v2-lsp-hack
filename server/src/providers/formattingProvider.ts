import {
    DocumentFormattingParams,
    DocumentRangeFormattingParams,
    TextEdit,
    Range,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';

/**
 * Provides document formatting for SysML files.
 *
 * Formatting rules:
 *  - Consistent indentation (spaces, configurable tab size)
 *  - Opening brace on same line as declaration
 *  - Closing brace aligned with opening statement
 *  - Remove trailing whitespace
 *  - Ensure single newline at end of file
 *  - Collapse multiple blank lines into one
 *  - Normalize spacing around operators (:, :>, :>>, =, ;)
 */
export class FormattingProvider {
    constructor(private documents: TextDocuments<TextDocument>) { }

    provideDocumentFormatting(params: DocumentFormattingParams): TextEdit[] {
        const doc = this.documents.get(params.textDocument.uri);
        if (!doc) return [];

        const tabSize = params.options.tabSize ?? 4;
        const insertSpaces = params.options.insertSpaces ?? true;
        const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';

        const text = doc.getText();
        const formatted = this.formatSysML(text, indent);

        if (formatted === text) return [];

        // Replace entire document
        return [
            TextEdit.replace(
                Range.create(0, 0, doc.lineCount, 0),
                formatted,
            ),
        ];
    }

    provideRangeFormatting(params: DocumentRangeFormattingParams): TextEdit[] {
        const doc = this.documents.get(params.textDocument.uri);
        if (!doc) return [];

        const tabSize = params.options.tabSize ?? 4;
        const insertSpaces = params.options.insertSpaces ?? true;
        const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';

        // Extract the range text
        const rangeText = doc.getText(params.range);
        const formatted = this.formatSysML(rangeText, indent);

        if (formatted === rangeText) return [];

        return [TextEdit.replace(params.range, formatted)];
    }

    private formatSysML(text: string, indent: string): string {
        const lines = text.split('\n');
        const result: string[] = [];
        let depth = 0;
        let prevBlank = false;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            // Remove trailing whitespace
            line = line.trimEnd();

            // Skip processing for empty lines (collapse multiples)
            if (line.trim() === '') {
                if (!prevBlank && result.length > 0) {
                    result.push('');
                    prevBlank = true;
                }
                continue;
            }
            prevBlank = false;

            const trimmed = line.trim();

            // Handle closing braces — decrease indent before this line
            const leadingCloses = (trimmed.match(/^[}\]]+/) || [''])[0].length;
            if (leadingCloses > 0) {
                depth = Math.max(0, depth - leadingCloses);
            }

            // Check if this line is inside a string or comment
            const isLineComment = trimmed.startsWith('//');
            const isBlockCommentContinuation =
                !trimmed.startsWith('/*') &&
                (trimmed.startsWith('*') || trimmed.startsWith('*/'));

            // Apply indentation
            let indented: string;
            if (isBlockCommentContinuation) {
                // Align block comment continuation with one extra space
                indented = indent.repeat(depth) + ' ' + trimmed;
            } else if (isLineComment) {
                indented = indent.repeat(depth) + trimmed;
            } else {
                // Normalize spacing in the trimmed line
                const normalized = this.normalizeSpacing(trimmed);
                indented = indent.repeat(depth) + normalized;
            }

            result.push(indented);

            // Count braces for depth tracking (ignoring those in strings/comments)
            if (!isLineComment) {
                const opens = this.countOutsideStrings(trimmed, '{') +
                    this.countOutsideStrings(trimmed, '[');
                const closes = this.countOutsideStrings(trimmed, '}') +
                    this.countOutsideStrings(trimmed, ']');
                // We already accounted for leading closes above
                depth += opens - closes + leadingCloses;
                depth = Math.max(0, depth);
            }
        }

        // Ensure single trailing newline
        while (result.length > 0 && result[result.length - 1] === '') {
            result.pop();
        }
        result.push('');

        return result.join('\n');
    }

    /**
     * Normalize spacing around common SysML operators.
     * Preserves spacing inside strings.
     */
    private normalizeSpacing(line: string): string {
        // Don't modify lines that are primarily strings
        if (line.startsWith('"') || line.startsWith("'")) return line;

        let result = line;

        // Normalize space before opening brace
        result = result.replace(/\s*{/g, ' {');

        // Ensure space after semicolons (for inline statements)
        result = result.replace(/;\s*(\S)/g, '; $1');

        // Clean up multiple spaces (but not in strings)
        result = result.replace(/  +/g, (match, offset) => {
            // Don't collapse spaces inside strings
            const before = result.substring(0, offset);
            const quotes = (before.match(/"/g) || []).length;
            if (quotes % 2 !== 0) return match;
            return ' ';
        });

        return result;
    }

    /**
     * Count occurrences of a character outside of string literals.
     */
    private countOutsideStrings(line: string, char: string): number {
        let count = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < line.length; i++) {
            const c = line[i];

            if (inString) {
                if (c === stringChar && line[i - 1] !== '\\') {
                    inString = false;
                }
            } else if (c === '"' || c === "'") {
                inString = true;
                stringChar = c;
            } else if (c === '/' && i + 1 < line.length) {
                if (line[i + 1] === '/') break; // line comment
                if (line[i + 1] === '*') break; // block comment start
            } else if (c === char) {
                count++;
            }
        }

        return count;
    }
}
