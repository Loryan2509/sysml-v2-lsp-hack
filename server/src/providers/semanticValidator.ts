import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node.js';
import { DocumentManager } from '../documentManager.js';
import { getLibraryPackageNames } from '../library/libraryIndex.js';
import { SymbolTable } from '../symbols/symbolTable.js';
import { SysMLElementKind, SysMLSymbol, isDefinition } from '../symbols/sysmlElements.js';

/**
 * Standard library types that are always available (from Kernel libraries).
 * These should not trigger "unresolved type" warnings.
 */
const STANDARD_LIBRARY_TYPES = new Set([
    // Kernel Data Types
    'Boolean', 'String', 'Integer', 'Real', 'Natural', 'Positive',
    'Complex', 'Number', 'Rational',
    'ScalarValues', 'DataFunctions',
    // Kernel Semantic Library
    'Anything', 'Nothing', 'Object', 'Occurrence',
    'Base', 'Objects', 'Occurrences', 'Items', 'Parts', 'Ports',
    'Actions', 'States', 'Connections', 'Interfaces', 'Allocations',
    'Requirements', 'Constraints', 'Calculations', 'Cases', 'Flows',
    'Transfers', 'Performances', 'TransitionPerformances',
    // Common library packages
    'ISQ', 'SI', 'USCustomaryUnits',
    'Quantities', 'MeasurementReferences', 'ScalarValues',
    // ISQ Base quantities (ISO 80000)
    'LengthValue', 'MassValue', 'DurationValue', 'TimeValue',
    'ElectricCurrentValue', 'ThermodynamicTemperatureValue', 'TemperatureValue',
    'AmountOfSubstanceValue', 'LuminousIntensityValue',
    // ISQ Derived quantities (commonly used)
    'AreaValue', 'VolumeValue', 'SpeedValue', 'VelocityValue', 'AccelerationValue',
    'ForceValue', 'EnergyValue', 'PowerValue', 'PressureValue',
    'TorqueValue', 'MomentOfForceValue', 'AngularVelocityValue', 'FrequencyValue',
    'DensityValue', 'MassFlowRateValue', 'VolumeFlowRateValue',
    // ISQ units
    'LengthUnit', 'MassUnit', 'DurationUnit', 'TimeUnit',
]);

/**
 * Pattern for ISQ quantity value types (e.g., LengthValue, TorqueValue).
 * These all end in "Value" and come from the ISQ library.
 */
const ISQ_VALUE_PATTERN = /^[A-Z][a-zA-Z]*Value$/;

/**
 * Semantic validator for SysML v2 documents.
 *
 * Runs validation rules on the symbol table that go beyond syntax checking:
 * - Unresolved type references
 * - Invalid multiplicity bounds
 * - Empty enumerations
 * - Duplicate definition names
 * - Mandatory features with unresolved types
 */
export class SemanticValidator {
    constructor(private readonly documentManager: DocumentManager) { }

    /**
     * Run all semantic validation rules and return LSP Diagnostic objects.
     */
    validate(uri: string): Diagnostic[] {
        const parseResult = this.documentManager.get(uri);
        if (!parseResult) return [];

        const symbolTable = new SymbolTable();
        symbolTable.build(uri, parseResult);

        const _text = this.documentManager.getText(uri) ?? '';
        const symbols = symbolTable.getSymbolsForUri(uri);
        const allSymbolNames = new Set(symbolTable.getAllSymbols().map(s => s.name));
        const libraryNames = new Set(getLibraryPackageNames());

        const diagnostics: Diagnostic[] = [];

        for (const symbol of symbols) {
            diagnostics.push(
                ...this.checkUnresolvedType(symbol, allSymbolNames, libraryNames),
                ...this.checkInvalidMultiplicity(symbol),
                ...this.checkEmptyEnum(symbol, symbols),
                ...this.checkNamingConvention(symbol),
                ...this.checkMissingDocumentation(symbol),
            );
        }

        diagnostics.push(...this.checkDuplicateDefinitions(symbols));
        diagnostics.push(...this.checkUnusedDefinitions(symbols));

        return diagnostics;
    }

    /**
     * Rule: Unresolved type reference.
     *
     * When a feature (part, attribute, port, etc.) references a type name
     * that doesn't exist in the document's symbol table or the standard
     * library, flag it as a warning. If the feature has a mandatory
     * multiplicity (lower >= 1), escalate to error with extra context.
     */
    private checkUnresolvedType(
        symbol: SysMLSymbol,
        allSymbolNames: Set<string>,
        libraryNames: Set<string>,
    ): Diagnostic[] {
        if (!symbol.typeName) return [];

        // Resolve the root segment for qualified names (e.g., "ISQ::MassValue" → "ISQ")
        const rootSegment = symbol.typeName.split('::')[0];

        // Skip if the type is defined in the document, standard library, or indexed library packages
        if (
            allSymbolNames.has(symbol.typeName) ||
            allSymbolNames.has(rootSegment) ||
            STANDARD_LIBRARY_TYPES.has(symbol.typeName) ||
            STANDARD_LIBRARY_TYPES.has(rootSegment) ||
            libraryNames.has(rootSegment) ||
            // Pattern match for ISQ quantity value types (e.g., LengthValue, TorqueValue)
            ISQ_VALUE_PATTERN.test(symbol.typeName)
        ) {
            return [];
        }

        const isMandatory = symbol.multiplicityRange &&
            symbol.multiplicityRange.lower >= 1;

        const severity = isMandatory
            ? DiagnosticSeverity.Error
            : DiagnosticSeverity.Warning;

        let message = `Type '${symbol.typeName}' is not defined in the current document or standard library`;
        if (isMandatory) {
            const multStr = symbol.multiplicity ?? '1';
            message += ` (feature '${symbol.name}' requires multiplicity [${multStr}])`;
        }

        return [{
            severity,
            range: symbol.selectionRange,
            message,
            source: 'sysml',
            code: 'unresolved-type',
        }];
    }

    /**
     * Rule: Invalid multiplicity bounds.
     *
     * Checks that lower bound ≤ upper bound when both are numeric.
     * Examples of invalid: [5..2], [10..1]
     */
    private checkInvalidMultiplicity(symbol: SysMLSymbol): Diagnostic[] {
        if (!symbol.multiplicityRange || !symbol.multiplicity) return [];

        const { lower, upper } = symbol.multiplicityRange;
        if (typeof upper === 'number' && lower > upper) {
            return [{
                severity: DiagnosticSeverity.Error,
                range: symbol.selectionRange,
                message: `Invalid multiplicity [${symbol.multiplicity}]: lower bound (${lower}) exceeds upper bound (${upper})`,
                source: 'sysml',
                code: 'invalid-multiplicity',
            }];
        }

        if (lower < 0) {
            return [{
                severity: DiagnosticSeverity.Error,
                range: symbol.selectionRange,
                message: `Invalid multiplicity [${symbol.multiplicity}]: lower bound cannot be negative`,
                source: 'sysml',
                code: 'invalid-multiplicity',
            }];
        }

        return [];
    }

    /**
     * Rule: Empty enumeration definition.
     *
     * An enum def with no enum values is likely incomplete.
     */
    private checkEmptyEnum(symbol: SysMLSymbol, allSymbols: SysMLSymbol[]): Diagnostic[] {
        if (symbol.kind !== SysMLElementKind.EnumDef) return [];

        const children = allSymbols.filter(s =>
            s.parentQualifiedName === symbol.qualifiedName
        );
        const hasEnumValues = children.some(c =>
            c.kind === SysMLElementKind.EnumUsage ||
            c.kind === SysMLElementKind.AttributeUsage
        );

        if (!hasEnumValues) {
            return [{
                severity: DiagnosticSeverity.Information,
                range: symbol.selectionRange,
                message: `Enumeration '${symbol.name}' has no enum values defined`,
                source: 'sysml',
                code: 'empty-enum',
            }];
        }

        return [];
    }

    /**
     * Rule: Naming convention.
     * Definitions should use PascalCase, usages should use camelCase.
     */
    private checkNamingConvention(symbol: SysMLSymbol): Diagnostic[] {
        if (!symbol.name) return [];
        // Skip non-identifiable kinds
        if (
            symbol.kind === SysMLElementKind.Package ||
            symbol.kind === SysMLElementKind.Import ||
            symbol.kind === SysMLElementKind.Comment ||
            symbol.kind === SysMLElementKind.Doc ||
            symbol.kind === SysMLElementKind.Alias ||
            symbol.kind === SysMLElementKind.Unknown
        ) return [];

        if (isDefinition(symbol.kind)) {
            // Definitions should be PascalCase (first letter uppercase)
            const ch = symbol.name[0];
            if (ch === ch.toLowerCase() && ch !== ch.toUpperCase()) {
                return [{
                    severity: DiagnosticSeverity.Hint,
                    range: symbol.selectionRange,
                    message: `Definition '${symbol.name}' should use PascalCase`,
                    source: 'sysml',
                    code: 'naming-convention',
                }];
            }
        } else {
            // Usages should be camelCase (first letter lowercase)
            const ch = symbol.name[0];
            if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) {
                return [{
                    severity: DiagnosticSeverity.Hint,
                    range: symbol.selectionRange,
                    message: `Usage '${symbol.name}' should use camelCase`,
                    source: 'sysml',
                    code: 'naming-convention',
                }];
            }
        }
        return [];
    }

    /**
     * Rule: Missing documentation.
     * Definitions without a doc comment get a hint.
     */
    private checkMissingDocumentation(symbol: SysMLSymbol): Diagnostic[] {
        if (!isDefinition(symbol.kind)) return [];
        if (symbol.documentation) return [];

        return [{
            severity: DiagnosticSeverity.Information,
            range: symbol.selectionRange,
            message: `Definition '${symbol.name}' has no documentation`,
            source: 'sysml',
            code: 'missing-doc',
        }];
    }

    /**
     * Rule: Unused definitions.
     * Definitions not referenced by any usage's typeNames.
     */
    private checkUnusedDefinitions(symbols: SysMLSymbol[]): Diagnostic[] {
        const defs = symbols.filter(s => isDefinition(s.kind));
        const referencedTypes = new Set(
            symbols
                .filter(s => !isDefinition(s.kind) && s.kind !== SysMLElementKind.Package)
                .flatMap(s => s.typeNames),
        );

        const diagnostics: Diagnostic[] = [];
        for (const def of defs) {
            if (!referencedTypes.has(def.name)) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Hint,
                    range: def.selectionRange,
                    message: `Definition '${def.name}' is not referenced by any usage in this document`,
                    source: 'sysml',
                    code: 'unused-definition',
                });
            }
        }
        return diagnostics;
    }

    /**
     * Rule: Duplicate definition names in the same scope.
     *
     * Two definitions (part def, port def, etc.) with the same name
     * in the same parent scope indicate a conflict.
     */
    /**
     * Static helper: run all symbol-level validation rules without a DocumentManager.
     * Used by the MCP layer which works directly with SysMLSymbol arrays.
     */
    static validateSymbols(symbols: SysMLSymbol[], allNames: Set<string>): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const instance = Object.create(SemanticValidator.prototype) as SemanticValidator;
        for (const symbol of symbols) {
            diagnostics.push(
                ...instance.checkUnresolvedType(symbol, allNames, new Set()),
                ...instance.checkInvalidMultiplicity(symbol),
                ...instance.checkEmptyEnum(symbol, symbols),
            );
        }
        diagnostics.push(...instance.checkDuplicateDefinitions(symbols));
        return diagnostics;
    }

    private checkDuplicateDefinitions(symbols: SysMLSymbol[]): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const definitionsByScope = new Map<string, Map<string, SysMLSymbol[]>>();

        for (const symbol of symbols) {
            if (!isDefinition(symbol.kind)) continue;

            const scope = symbol.parentQualifiedName ?? '__root__';
            let scopeMap = definitionsByScope.get(scope);
            if (!scopeMap) {
                scopeMap = new Map();
                definitionsByScope.set(scope, scopeMap);
            }

            let defs = scopeMap.get(symbol.name);
            if (!defs) {
                defs = [];
                scopeMap.set(symbol.name, defs);
            }
            defs.push(symbol);
        }

        for (const scopeMap of definitionsByScope.values()) {
            for (const [name, defs] of scopeMap) {
                if (defs.length > 1) {
                    for (const def of defs) {
                        diagnostics.push({
                            severity: DiagnosticSeverity.Warning,
                            range: def.selectionRange,
                            message: `Duplicate definition: '${name}' is defined ${defs.length} times in the same scope`,
                            source: 'sysml',
                            code: 'duplicate-definition',
                        });
                    }
                }
            }
        }

        return diagnostics;
    }
}
