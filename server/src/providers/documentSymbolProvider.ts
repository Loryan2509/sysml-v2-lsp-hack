import {
    DocumentSymbolParams,
    DocumentSymbol,
    SymbolKind,
} from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { SymbolTable } from '../symbols/symbolTable.js';
import { SysMLSymbol, SysMLElementKind } from '../symbols/sysmlElements.js';

/**
 * Provides document symbols for the outline panel and breadcrumbs.
 * Walks the symbol table and builds a hierarchical DocumentSymbol tree.
 */
export class DocumentSymbolProvider {
    private symbolTable = new SymbolTable();

    constructor(private documentManager: DocumentManager) {}

    provideDocumentSymbols(params: DocumentSymbolParams): DocumentSymbol[] {
        const result = this.documentManager.get(params.textDocument.uri);
        if (!result) {
            return [];
        }

        // Build symbol table
        this.symbolTable.build(params.textDocument.uri, result);

        // Get all symbols for this document
        const symbols = this.symbolTable.getSymbolsForUri(params.textDocument.uri);

        // Build hierarchical structure
        return this.buildHierarchy(symbols);
    }

    private buildHierarchy(symbols: SysMLSymbol[]): DocumentSymbol[] {
        // Separate top-level symbols from children
        const topLevel: SysMLSymbol[] = [];
        const byQualifiedName = new Map<string, SysMLSymbol>();
        const childrenOf = new Map<string, SysMLSymbol[]>();

        for (const sym of symbols) {
            byQualifiedName.set(sym.qualifiedName, sym);
            if (!sym.parentQualifiedName) {
                topLevel.push(sym);
            } else {
                const siblings = childrenOf.get(sym.parentQualifiedName) ?? [];
                siblings.push(sym);
                childrenOf.set(sym.parentQualifiedName, siblings);
            }
        }

        const buildSymbol = (sym: SysMLSymbol): DocumentSymbol => {
            const children = childrenOf.get(sym.qualifiedName) ?? [];
            return {
                name: sym.name,
                detail: sym.kind,
                kind: this.getSymbolKind(sym.kind),
                range: sym.range,
                selectionRange: sym.selectionRange,
                children: children.map(buildSymbol),
            };
        };

        return topLevel.map(buildSymbol);
    }

    private getSymbolKind(kind: SysMLElementKind): SymbolKind {
        switch (kind) {
            case SysMLElementKind.Package:
                return SymbolKind.Package;
            case SysMLElementKind.PartDef:
            case SysMLElementKind.PartUsage:
                return SymbolKind.Class;
            case SysMLElementKind.AttributeDef:
            case SysMLElementKind.AttributeUsage:
                return SymbolKind.Property;
            case SysMLElementKind.PortDef:
            case SysMLElementKind.PortUsage:
                return SymbolKind.Interface;
            case SysMLElementKind.ActionDef:
            case SysMLElementKind.ActionUsage:
                return SymbolKind.Method;
            case SysMLElementKind.StateDef:
            case SysMLElementKind.StateUsage:
                return SymbolKind.Enum;
            case SysMLElementKind.RequirementDef:
            case SysMLElementKind.RequirementUsage:
                return SymbolKind.Object;
            case SysMLElementKind.ConstraintDef:
            case SysMLElementKind.ConstraintUsage:
                return SymbolKind.Constant;
            case SysMLElementKind.ConnectionDef:
            case SysMLElementKind.ConnectionUsage:
            case SysMLElementKind.InterfaceDef:
            case SysMLElementKind.InterfaceUsage:
                return SymbolKind.Interface;
            case SysMLElementKind.ItemDef:
            case SysMLElementKind.ItemUsage:
                return SymbolKind.Struct;
            case SysMLElementKind.EnumDef:
            case SysMLElementKind.EnumUsage:
                return SymbolKind.Enum;
            case SysMLElementKind.CalcDef:
            case SysMLElementKind.CalcUsage:
                return SymbolKind.Function;
            case SysMLElementKind.UseCaseDef:
            case SysMLElementKind.UseCaseUsage:
                return SymbolKind.Event;
            case SysMLElementKind.ViewDef:
            case SysMLElementKind.ViewUsage:
            case SysMLElementKind.ViewpointDef:
            case SysMLElementKind.ViewpointUsage:
                return SymbolKind.Namespace;
            case SysMLElementKind.Comment:
            case SysMLElementKind.Doc:
                return SymbolKind.String;
            case SysMLElementKind.Import:
            case SysMLElementKind.Alias:
                return SymbolKind.Module;
            default:
                return SymbolKind.Variable;
        }
    }
}
