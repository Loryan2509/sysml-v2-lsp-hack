import {
    CodeAction,
    CodeActionKind,
    CodeActionParams,
    Diagnostic,
    TextEdit,
    WorkspaceEdit,
} from 'vscode-languageserver/node.js';

/**
 * Provides code actions (quick fixes) for SysML documents.
 *
 * Currently supports:
 *  - Fix keyword typos (replaces misspelled keyword with suggested correction)
 */
export class CodeActionProvider {
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
        }

        return actions;
    }

    /**
     * If the diagnostic is a keyword typo ("Did you mean 'X'?"), offer
     * a quick fix that replaces the misspelled word with the suggestion.
     */
    private tryKeywordTypoFix(
        uri: string,
        diagnostic: Diagnostic,
    ): CodeAction | undefined {
        // Match messages like: Unknown keyword 'paart'. Did you mean 'part'?
        const match = diagnostic.message.match(
            /Unknown keyword '(\w+)'\.\s*Did you mean '(\w+)'\?/,
        );
        if (!match) return undefined;

        const [, typo, suggestion] = match;

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
}
