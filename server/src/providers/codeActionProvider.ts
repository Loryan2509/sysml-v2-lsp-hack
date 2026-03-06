import {
    CodeAction,
    CodeActionKind,
    CodeActionParams,
    Diagnostic,
    Position,
    TextEdit,
    WorkspaceEdit
} from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';

/**
 * Provides code actions (quick fixes) for SysML documents.
 *
 * Supports:
 *  - Fix keyword typos (replaces misspelled keyword with suggested correction)
 *  - Naming convention: rename to PascalCase / camelCase
 *  - Missing documentation: insert a doc comment stub
 *  - Empty enumeration: add a placeholder enum value
 *  - Unused definition: prefix with underscore to suppress
 */
export class CodeActionProvider {
    constructor(private readonly documentManager: DocumentManager) { }

    /**
     * Return code actions for the given range, typically in response to
     * a lightbulb appearing on a diagnostic.
     */
    provideCodeActions(params: CodeActionParams): CodeAction[] {
        const actions: CodeAction[] = [];
        const uri = params.textDocument.uri;

        for (const diagnostic of params.context.diagnostics) {
            // Keyword typo fix
            const typoFix = this.tryKeywordTypoFix(uri, diagnostic);
            if (typoFix) {
                actions.push(typoFix);
            }

            // Naming convention fix
            const namingFix = this.tryNamingConventionFix(uri, diagnostic);
            if (namingFix) {
                actions.push(namingFix);
            }

            // Missing documentation fix
            const docFix = this.tryMissingDocFix(uri, diagnostic);
            if (docFix) {
                actions.push(docFix);
            }

            // Empty enumeration fix
            const enumFix = this.tryEmptyEnumFix(uri, diagnostic);
            if (enumFix) {
                actions.push(enumFix);
            }

            // Unused definition fix
            const unusedFix = this.tryUnusedDefinitionFix(uri, diagnostic);
            if (unusedFix) {
                actions.push(unusedFix);
            }
        }

        return actions;
    }

    // ── Keyword typo ────────────────────────────────────────────────

    /**
     * If the diagnostic is a keyword typo ("Did you mean 'X'?"), offer
     * a quick fix that replaces the misspelled word with the suggestion.
     */
    private tryKeywordTypoFix(
        uri: string,
        diagnostic: Diagnostic,
    ): CodeAction | undefined {
        // Use structured data from diagnostic if available, fall back to message parsing
        const data = diagnostic.data as { typo?: string; suggestion?: string } | undefined;
        let typo: string | undefined;
        let suggestion: string | undefined;

        if (data?.typo && data?.suggestion) {
            typo = data.typo;
            suggestion = data.suggestion;
        } else {
            // Fallback: parse message "Unknown keyword 'X'. Did you mean 'Y'?"
            const msg = diagnostic.message;
            typo = extractQuotedString(msg, "Unknown keyword '");
            suggestion = extractQuotedString(msg, "Did you mean '");
        }

        if (!typo || !suggestion) return undefined;

        const edit: WorkspaceEdit = {
            changes: {
                [uri]: [
                    TextEdit.replace(diagnostic.range, suggestion),
                ],
            },
        };

        return {
            title: `Fix typo: '${typo}' → '${suggestion}'`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: true,
            edit,
        };
    }

    // ── Naming convention ───────────────────────────────────────────

    /**
     * Offer to rename an identifier to PascalCase or camelCase.
     */
    private tryNamingConventionFix(
        uri: string,
        diagnostic: Diagnostic,
    ): CodeAction | undefined {
        if (diagnostic.code !== 'naming-convention') return undefined;

        const data = diagnostic.data as { name?: string; convention?: string } | undefined;
        let name: string | undefined;
        let isPascal: boolean;
        let isCamel: boolean;

        if (data?.name && data?.convention) {
            name = data.name;
            isPascal = data.convention === 'PascalCase';
            isCamel = data.convention === 'camelCase';
        } else {
            // Fallback: parse from message
            isPascal = diagnostic.message.includes('PascalCase');
            isCamel = diagnostic.message.includes('camelCase');
            // Extract name from "Definition 'X'" or "Usage 'X'"
            name = extractQuotedString(diagnostic.message, "Definition '")
                ?? extractQuotedString(diagnostic.message, "Usage '");
        }

        if (!isPascal && !isCamel) return undefined;
        if (!name) return undefined;

        let newName: string;
        if (isPascal) {
            // camelCase → PascalCase: capitalize first letter
            newName = name.charAt(0).toUpperCase() + name.slice(1);
        } else {
            // PascalCase → camelCase: lowercase first letter
            newName = name.charAt(0).toLowerCase() + name.slice(1);
        }

        const edit: WorkspaceEdit = {
            changes: {
                [uri]: [
                    TextEdit.replace(diagnostic.range, newName),
                ],
            },
        };

        return {
            title: `Rename to '${newName}'`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: true,
            edit,
        };
    }

    // ── Missing documentation ───────────────────────────────────────

    /**
     * Insert a `doc` comment inside the definition body, right after
     * the opening brace.  Per the SysML v2 spec, `doc` is an owned
     * member of the definition — not a preceding annotation.
     */
    private tryMissingDocFix(
        uri: string,
        diagnostic: Diagnostic,
    ): CodeAction | undefined {
        if (diagnostic.code !== 'missing-doc') return undefined;

        // Extract the definition name from structured data or message
        const data = diagnostic.data as { name?: string } | undefined;
        const name = data?.name ?? extractQuotedString(diagnostic.message, "Definition '");
        if (!name) return undefined;

        const text = this.documentManager.getText(uri);
        if (!text) return undefined;

        // Find the opening brace of the definition body
        const lines = text.split('\n');
        const startLine = diagnostic.range.start.line;

        let bracePos: Position | undefined;
        for (let i = startLine; i < Math.min(startLine + 5, lines.length); i++) {
            const braceIdx = lines[i].indexOf('{');
            if (braceIdx >= 0) {
                bracePos = Position.create(i, braceIdx + 1);
                break;
            }
        }

        if (!bracePos) return undefined;

        // Indent one level deeper than the definition
        const defIndent = this.getLineIndent(text, startLine);
        const childIndent = defIndent + '    ';

        const docComment = `\n${childIndent}doc /* TODO: Describe ${name} */`;

        const edit: WorkspaceEdit = {
            changes: {
                [uri]: [
                    TextEdit.insert(bracePos, docComment),
                ],
            },
        };

        return {
            title: `Add documentation for '${name}'`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: false,
            edit,
        };
    }

    // ── Empty enumeration ───────────────────────────────────────────

    /**
     * Add a placeholder `enum value` inside an empty enum definition.
     */
    private tryEmptyEnumFix(
        uri: string,
        diagnostic: Diagnostic,
    ): CodeAction | undefined {
        if (diagnostic.code !== 'empty-enum') return undefined;

        const text = this.documentManager.getText(uri);
        if (!text) return undefined;

        // Find the opening brace after the enum definition
        const lines = text.split('\n');
        const startLine = diagnostic.range.start.line;

        let bracePos: Position | undefined;
        for (let i = startLine; i < Math.min(startLine + 5, lines.length); i++) {
            const braceIdx = lines[i].indexOf('{');
            if (braceIdx >= 0) {
                bracePos = Position.create(i, braceIdx + 1);
                break;
            }
        }

        if (!bracePos) return undefined;

        // Determine indentation (one level deeper than the definition)
        const defIndent = this.getLineIndent(text, startLine);
        const childIndent = defIndent + '    ';

        const insertText = `\n${childIndent}enum value1;\n${childIndent}enum value2;`;

        const edit: WorkspaceEdit = {
            changes: {
                [uri]: [
                    TextEdit.insert(bracePos, insertText),
                ],
            },
        };

        return {
            title: 'Add placeholder enum values',
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: false,
            edit,
        };
    }

    // ── Unused definition ───────────────────────────────────────────

    /**
     * Prefix the definition name with an underscore to mark as intentionally
     * unused (conventional suppression).
     */
    private tryUnusedDefinitionFix(
        uri: string,
        diagnostic: Diagnostic,
    ): CodeAction | undefined {
        if (diagnostic.code !== 'unused-definition') return undefined;

        const data = diagnostic.data as { name?: string } | undefined;
        const name = data?.name ?? extractQuotedString(diagnostic.message, "Definition '");
        if (!name) return undefined;

        // Already prefixed?
        if (name.startsWith('_')) return undefined;

        const newName = `_${name}`;

        const edit: WorkspaceEdit = {
            changes: {
                [uri]: [
                    TextEdit.replace(diagnostic.range, newName),
                ],
            },
        };

        return {
            title: `Prefix with underscore: '_${name}'`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: false,
            edit,
        };
    }

    // ── Helpers ──────────────────────────────────────────────────────

    /**
     * Return the leading whitespace of a given line number.
     */
    private getLineIndent(text: string | undefined, line: number): string {
        if (!text) return '';
        const lines = text.split('\n');
        if (line < 0 || line >= lines.length) return '';
        const ln = lines[line];
        let end = 0;
        while (end < ln.length && (ln[end] === ' ' || ln[end] === '\t')) end++;
        return ln.substring(0, end);
    }
}

/**
 * Extract a quoted string from text given a prefix that ends just before the
 * opening quote.  For example:
 *   extractQuotedString("Definition 'Foo' has ...", "Definition '") → "Foo"
 *   extractQuotedString("Unknown keyword 'paart'.", "Unknown keyword '") → "paart"
 */
function extractQuotedString(text: string, prefixWithQuote: string): string | undefined {
    const idx = text.indexOf(prefixWithQuote);
    if (idx < 0) return undefined;
    const start = idx + prefixWithQuote.length;
    const end = text.indexOf("'", start);
    if (end < 0) return undefined;
    return text.substring(start, end);
}
