import {
    SymbolKind,
    TypeHierarchyItem,
    TypeHierarchyPrepareParams,
    TypeHierarchySubtypesParams,
    TypeHierarchySupertypesParams,
} from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { SymbolTable } from '../symbols/symbolTable.js';
import { isDefinition, SysMLElementKind, SysMLSymbol } from '../symbols/sysmlElements.js';

/**
 * Provides type hierarchy for SysML definitions.
 *
 * Navigate `:>` (specializes) chains:
 *  - Supertypes: what does this type specialize?
 *  - Subtypes: what specializes this type?
 */
export class TypeHierarchyProvider {
    private symbolTable = new SymbolTable();

    constructor(private documentManager: DocumentManager) { }

    prepareTypeHierarchy(params: TypeHierarchyPrepareParams): TypeHierarchyItem[] | null {
        const uri = params.textDocument.uri;
        const result = this.documentManager.get(uri);
        if (!result) return null;

        const text = this.documentManager.getText(uri);
        if (!text) return null;

        this.buildAllSymbols();
        this.symbolTable.build(uri, result);

        const symbol = this.symbolTable.findSymbolAtPosition(
            uri, params.position.line, params.position.character,
        );
        if (!symbol || !isDefinition(symbol.kind)) return null;

        return [this.toTypeHierarchyItem(symbol)];
    }

    provideSupertypes(params: TypeHierarchySupertypesParams): TypeHierarchyItem[] {
        this.buildAllSymbols();

        const item = params.item;
        // Find the symbol for this item
        const symbols = this.symbolTable.getSymbolsForUri(item.uri);
        const sym = symbols.find(s =>
            s.name === item.name &&
            s.selectionRange.start.line === item.selectionRange.start.line
        );
        if (!sym || sym.typeNames.length === 0) return [];

        // The typeNames holds all supertype names
        const items: TypeHierarchyItem[] = [];
        for (const tn of sym.typeNames) {
            const supertypes = this.symbolTable.findByName(tn);
            for (const s of supertypes) {
                if (isDefinition(s.kind)) {
                    items.push(this.toTypeHierarchyItem(s));
                }
            }
        }
        return items;
    }

    provideSubtypes(params: TypeHierarchySubtypesParams): TypeHierarchyItem[] {
        this.buildAllSymbols();

        const item = params.item;
        const allSymbols = this.symbolTable.getAllSymbols();

        // Find all definitions whose typeNames includes this item's name
        const subtypes = allSymbols.filter(s =>
            isDefinition(s.kind) && s.typeNames.includes(item.name)
        );

        return subtypes.map(s => this.toTypeHierarchyItem(s));
    }

    private buildAllSymbols(): void {
        for (const uri of this.documentManager.getUris()) {
            const result = this.documentManager.get(uri);
            if (result) {
                this.symbolTable.build(uri, result);
            }
        }
    }

    private toTypeHierarchyItem(sym: SysMLSymbol): TypeHierarchyItem {
        return {
            name: sym.name,
            kind: this.toSymbolKind(sym.kind),
            uri: sym.uri,
            range: sym.range,
            selectionRange: sym.selectionRange,
            detail: sym.typeNames.length > 0 ? `specializes ${sym.typeNames.join(', ')}` : sym.kind,
        };
    }

    private toSymbolKind(kind: SysMLElementKind): SymbolKind {
        switch (kind) {
            case SysMLElementKind.Package: return SymbolKind.Package;
            case SysMLElementKind.PartDef: return SymbolKind.Class;
            case SysMLElementKind.ActionDef: return SymbolKind.Method;
            case SysMLElementKind.StateDef: return SymbolKind.Enum;
            case SysMLElementKind.ItemDef: return SymbolKind.Struct;
            case SysMLElementKind.PortDef:
            case SysMLElementKind.InterfaceDef:
            case SysMLElementKind.ConnectionDef: return SymbolKind.Interface;
            case SysMLElementKind.EnumDef: return SymbolKind.Enum;
            case SysMLElementKind.CalcDef: return SymbolKind.Function;
            case SysMLElementKind.RequirementDef: return SymbolKind.Object;
            case SysMLElementKind.ConstraintDef: return SymbolKind.Constant;
            default: return SymbolKind.Class;
        }
    }
}
