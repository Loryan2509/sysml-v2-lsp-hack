import { Range } from 'vscode-languageserver/node.js';

/**
 * Kinds of SysML elements tracked in the symbol table.
 */
export enum SysMLElementKind {
    Package = 'package',
    PartDef = 'part def',
    PartUsage = 'part',
    AttributeDef = 'attribute def',
    AttributeUsage = 'attribute',
    PortDef = 'port def',
    PortUsage = 'port',
    ConnectionDef = 'connection def',
    ConnectionUsage = 'connection',
    InterfaceDef = 'interface def',
    InterfaceUsage = 'interface',
    ActionDef = 'action def',
    ActionUsage = 'action',
    PerformActionUsage = 'perform action',
    StateDef = 'state def',
    StateUsage = 'state',
    ExhibitStateUsage = 'exhibit state',
    TransitionUsage = 'transition',
    RequirementDef = 'requirement def',
    RequirementUsage = 'requirement',
    ConstraintDef = 'constraint def',
    ConstraintUsage = 'constraint',
    ItemDef = 'item def',
    ItemUsage = 'item',
    AllocationDef = 'allocation def',
    AllocationUsage = 'allocation',
    UseCaseDef = 'use case def',
    UseCaseUsage = 'use case',
    IncludeUseCaseUsage = 'include use case',
    ActorUsage = 'actor',
    SubjectUsage = 'subject',
    EnumDef = 'enum def',
    EnumUsage = 'enum',
    CalcDef = 'calc def',
    CalcUsage = 'calc',
    ViewDef = 'view def',
    ViewUsage = 'view',
    ViewpointDef = 'viewpoint def',
    ViewpointUsage = 'viewpoint',
    OccurrenceDef = 'occurrence def',
    OccurrenceUsage = 'occurrence',
    RefUsage = 'ref',
    MetadataDef = 'metadata def',
    RenderingDef = 'rendering def',
    AnalysisCaseDef = 'analysis case def',
    VerificationCaseDef = 'verification case def',
    Comment = 'comment',
    Doc = 'doc',
    Alias = 'alias',
    Import = 'import',
    Unknown = 'unknown',
}

/**
 * A symbol entry in the symbol table.
 */
export interface SysMLSymbol {
    /** The symbol's name */
    name: string;
    /** The kind of SysML element */
    kind: SysMLElementKind;
    /** The fully qualified name (e.g., "VehicleModel::Chassis::wheel") */
    qualifiedName: string;
    /** The range where the symbol is defined */
    range: Range;
    /** The range of just the symbol's name (for rename, hover) */
    selectionRange: Range;
    /** The URI of the document containing this symbol */
    uri: string;
    /** The type this symbol specializes (e.g., "Vehicle" in "part car : Vehicle") */
    typeName?: string;
    /** Type names as an array (populated from typeName for multi-type support). */
    typeNames: string[];
    /** Documentation string if available */
    documentation?: string;
    /** Parent symbol's qualified name */
    parentQualifiedName?: string;
    /** Child symbol qualified names */
    children: string[];
    /** Multiplicity as a string (e.g., "1", "0..*", "2..5") */
    multiplicity?: string;
    /** Parsed multiplicity bounds */
    multiplicityRange?: { lower: number; upper: number | '*' };
}

/**
 * Whether an element kind is a definition (type) or usage (instance).
 */
export function isDefinition(kind: SysMLElementKind): boolean {
    return kind.endsWith(' def');
}

/**
 * Whether an element kind is a usage (instance).
 */
export function isUsage(kind: SysMLElementKind): boolean {
    return !isDefinition(kind) && kind !== SysMLElementKind.Package
        && kind !== SysMLElementKind.Import && kind !== SysMLElementKind.Comment
        && kind !== SysMLElementKind.Doc && kind !== SysMLElementKind.Alias
        && kind !== SysMLElementKind.Unknown;
}
