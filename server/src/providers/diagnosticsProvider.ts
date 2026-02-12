import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { SyntaxError } from '../parser/errorListener.js';
import { validateKeywords } from './keywordValidator.js';

/**
 * Provides diagnostics (errors/warnings) for SysML documents.
 * Converts ANTLR parse errors into LSP Diagnostic objects.
 */
export class DiagnosticsProvider {
    constructor(private documentManager: DocumentManager) { }

    /**
     * Get diagnostics for a parsed document.
     */
    getDiagnostics(uri: string): Diagnostic[] {
        const result = this.documentManager.get(uri);
        if (!result) {
            return [];
        }

        const diagnostics: Diagnostic[] = [];

        // Convert syntax errors to diagnostics
        for (const error of result.errors) {
            diagnostics.push(this.syntaxErrorToDiagnostic(error));
        }

        // Check for likely keyword typos
        diagnostics.push(...validateKeywords(result));

        return diagnostics;
    }

    private syntaxErrorToDiagnostic(error: SyntaxError): Diagnostic {
        return {
            severity: DiagnosticSeverity.Error,
            range: {
                start: { line: error.line, character: error.column },
                end: { line: error.line, character: error.column + error.length },
            },
            message: error.message,
            source: 'sysml',
        };
    }
}
