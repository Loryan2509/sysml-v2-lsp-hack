import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    ParameterInformation,
    SignatureHelp,
    SignatureHelpParams,
    SignatureInformation,
    TextDocuments,
} from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { SymbolTable } from '../symbols/symbolTable.js';
import { SysMLElementKind } from '../symbols/sysmlElements.js';

/**
 * Provides signature help when typing inside action/calc invocations.
 *
 * Shows parameter names and types from the definition in a tooltip
 * when the cursor is inside `perform`, `include`, or inline action bodies.
 */
export class SignatureHelpProvider {
    private symbolTable = new SymbolTable();

    constructor(
        private documentManager: DocumentManager,
        private documents: TextDocuments<TextDocument>,
    ) { }

    provideSignatureHelp(params: SignatureHelpParams): SignatureHelp | null {
        const uri = params.textDocument.uri;
        const doc = this.documents.get(uri);
        if (!doc) return null;

        const result = this.documentManager.get(uri);
        if (!result) return null;

        // Build symbol tables for all documents for cross-file resolution
        for (const knownUri of this.documentManager.getUris()) {
            const r = this.documentManager.get(knownUri);
            if (r) this.symbolTable.build(knownUri, r);
        }

        const text = doc.getText();
        const offset = doc.offsetAt(params.position);

        // Look backward from cursor for a pattern like `perform <name>(` or `include <name>(`
        // or simply for a name that resolves to a calc/action def
        const lineText = text.slice(
            text.lastIndexOf('\n', offset - 1) + 1,
            offset,
        );

        // Match patterns: `perform ActionName(`, `include CalcName(`, or just `CalcName(`
        const match = lineText.match(
            /(?:perform|include|action|calc)\s+(\w+)\s*\(?\s*$|(\w+)\s*\(\s*$/
        );
        if (!match) return null;

        const targetName = match[1] ?? match[2];
        if (!targetName) return null;

        // Find the definition
        const defs = this.symbolTable.findByName(targetName);
        const def = defs.find(d =>
            d.kind === SysMLElementKind.ActionDef ||
            d.kind === SysMLElementKind.CalcDef ||
            d.kind === SysMLElementKind.UseCaseDef ||
            d.kind === SysMLElementKind.ConstraintDef
        );
        if (!def) return null;

        // Extract parameters from the definition's children
        const allSymbols = this.symbolTable.getAllSymbols();
        const params_list = allSymbols.filter(s =>
            s.parentQualifiedName === def.qualifiedName &&
            (s.kind === SysMLElementKind.AttributeUsage ||
                s.kind === SysMLElementKind.PartUsage ||
                s.kind === SysMLElementKind.ItemUsage ||
                s.kind === SysMLElementKind.PortUsage)
        );

        if (params_list.length === 0) return null;

        const paramInfos: ParameterInformation[] = params_list.map(p => ({
            label: p.typeNames.length > 0 ? `${p.name} : ${p.typeNames.join(', ')}` : p.name,
            documentation: p.documentation ?? `${p.kind} parameter`,
        }));

        const sigLabel = `${targetName}(${paramInfos.map(p => p.label).join(', ')})`;

        const sig: SignatureInformation = {
            label: sigLabel,
            documentation: def.documentation ?? `${def.kind} ${def.name}`,
            parameters: paramInfos,
        };

        // Figure out which parameter the cursor is on
        const textAfterParen = lineText.slice(lineText.lastIndexOf('(') + 1);
        const commaCount = (textAfterParen.match(/,/g) ?? []).length;

        return {
            signatures: [sig],
            activeSignature: 0,
            activeParameter: Math.min(commaCount, paramInfos.length - 1),
        };
    }
}
