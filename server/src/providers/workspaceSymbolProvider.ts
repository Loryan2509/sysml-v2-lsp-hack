import {
    WorkspaceSymbolParams,
    SymbolInformation,
    SymbolKind,
} from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { SymbolTable } from '../symbols/symbolTable.js';
import { SysMLElementKind } from '../symbols/sysmlElements.js';

/**
 * Provides workspace-wide symbol search (Ctrl+T / # search).
 *
 * Aggregates symbols from all open/parsed documents, supporting
 * fuzzy filtering by name.
 */
export class WorkspaceSymbolProvider {
    private symbolTable = new SymbolTable();

    constructor(private documentManager: DocumentManager) { }

    provideWorkspaceSymbols(params: WorkspaceSymbolParams): SymbolInformation[] {
        const query = params.query.toLowerCase();

        // Build symbol tables for all cached documents
        for (const uri of this.documentManager.getUris()) {
            const result = this.documentManager.get(uri);
            if (result) {
                this.symbolTable.build(uri, result);
            }
        }

        const allSymbols = this.symbolTable.getAllSymbols();
        const results: SymbolInformation[] = [];

        for (const sym of allSymbols) {
            // Filter by query (empty query returns all)
            if (query && !sym.name.toLowerCase().includes(query) &&
                !sym.qualifiedName.toLowerCase().includes(query)) {
                continue;
            }

            results.push({
                name: sym.name,
                kind: toSymbolKind(sym.kind),
                location: {
                    uri: sym.uri,
                    range: sym.selectionRange,
                },
                containerName: sym.parentQualifiedName,
            });

            // Limit results to avoid overwhelming the UI
            if (results.length >= 200) break;
        }

        return results;
    }
}

function toSymbolKind(kind: SysMLElementKind): SymbolKind {
    switch (kind) {
        case SysMLElementKind.Package: return SymbolKind.Package;
        case SysMLElementKind.PartDef:
        case SysMLElementKind.PartUsage: return SymbolKind.Class;
        case SysMLElementKind.AttributeDef:
        case SysMLElementKind.AttributeUsage: return SymbolKind.Property;
        case SysMLElementKind.PortDef:
        case SysMLElementKind.PortUsage: return SymbolKind.Interface;
        case SysMLElementKind.ActionDef:
        case SysMLElementKind.ActionUsage: return SymbolKind.Method;
        case SysMLElementKind.StateDef:
        case SysMLElementKind.StateUsage: return SymbolKind.Enum;
        case SysMLElementKind.RequirementDef:
        case SysMLElementKind.RequirementUsage: return SymbolKind.Object;
        case SysMLElementKind.ConstraintDef:
        case SysMLElementKind.ConstraintUsage: return SymbolKind.Constant;
        case SysMLElementKind.ConnectionDef:
        case SysMLElementKind.ConnectionUsage:
        case SysMLElementKind.InterfaceDef:
        case SysMLElementKind.InterfaceUsage: return SymbolKind.Interface;
        case SysMLElementKind.ItemDef:
        case SysMLElementKind.ItemUsage: return SymbolKind.Struct;
        case SysMLElementKind.EnumDef:
        case SysMLElementKind.EnumUsage: return SymbolKind.Enum;
        case SysMLElementKind.CalcDef:
        case SysMLElementKind.CalcUsage: return SymbolKind.Function;
        case SysMLElementKind.UseCaseDef:
        case SysMLElementKind.UseCaseUsage: return SymbolKind.Event;
        case SysMLElementKind.ViewDef:
        case SysMLElementKind.ViewUsage:
        case SysMLElementKind.ViewpointDef:
        case SysMLElementKind.ViewpointUsage: return SymbolKind.Namespace;
        case SysMLElementKind.Comment:
        case SysMLElementKind.Doc: return SymbolKind.String;
        case SysMLElementKind.Import:
        case SysMLElementKind.Alias: return SymbolKind.Module;
        default: return SymbolKind.Variable;
    }
}
