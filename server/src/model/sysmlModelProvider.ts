/**
 * SysML Model Provider — converts the LSP server's internal representations
 * (ANTLR parse tree + SymbolTable) into the DTO shapes defined in
 * `sysmlModelTypes.ts`.
 *
 * This is the core of the `sysml/model` custom LSP request.  It reuses
 * the existing parse cache (via DocumentManager) so responses are near-instant.
 */

import { Range } from 'vscode-languageserver/node.js';
import { analyseComplexity } from '../analysis/complexityAnalyzer.js';
import { DocumentManager } from '../documentManager.js';
import { ParseResult } from '../parser/parseDocument.js';
import { SymbolTable } from '../symbols/symbolTable.js';
import { SysMLElementKind, SysMLSymbol, isDefinition, isUsage } from '../symbols/sysmlElements.js';

import type {
    ActivityActionDTO,
    ActivityDiagramDTO,
    ActivityStateDTO,
    ControlFlowDTO,
    DecisionNodeDTO,
    MessageDTO,
    ParticipantDTO,
    RangeDTO,
    RelationshipDTO,
    ResolvedFeatureDTO,
    ResolvedTypeDTO,
    SemanticDiagnosticDTO,
    SequenceDiagramDTO,
    SysMLElementDTO,
    SysMLModelResult,
    SysMLModelScope,
} from './sysmlModelTypes.js';

/**
 * Provides the full semantic model for a document by converting the
 * server's internal ANTLR parse tree and symbol table into serializable DTOs.
 *
 * The symbol table is cached per URI + document version so repeated
 * `getModel()` calls (dashboard refresh, explorer update, etc.) skip
 * the ANTLR tree walk when the source hasn't changed.
 */
export class SysMLModelProvider {
    /** Cached symbol tables keyed by URI. */
    private _stCache = new Map<string, { version: number; table: SymbolTable }>();

    constructor(private readonly documentManager: DocumentManager) { }

    /** Remove cached symbol table for a URI (e.g. on document close). */
    removeUri(uri: string): void {
        this._stCache.delete(uri);
    }

    /**
     * Drop **all** cached symbol tables.
     * Returns the number of entries that were evicted.
     */
    clearAll(): number {
        const count = this._stCache.size;
        this._stCache.clear();
        return count;
    }

    /** Number of cached symbol tables (for diagnostics / stats). */
    get cacheSize(): number {
        return this._stCache.size;
    }

    /**
     * Return a cached-or-fresh SymbolTable for a URI.
     *
     * The table is rebuilt only when the document version changes.
     */
    private _getSymbolTable(uri: string, parseResult: ParseResult): SymbolTable {
        const version = this.documentManager.getVersion(uri);
        const cached = this._stCache.get(uri);
        if (cached && cached.version === version) {
            return cached.table;
        }
        const table = new SymbolTable();
        table.build(uri, parseResult);
        this._stCache.set(uri, { version, table });
        return table;
    }

    /**
     * Build the model response for a document.
     *
     * @param uri       Document URI
     * @param version   Document version (for staleness detection)
     * @param scopes    Which sections to include (empty/undefined = all)
     */
    getModel(uri: string, version: number, scopes?: SysMLModelScope[]): SysMLModelResult {
        const startTime = Date.now();
        const parseResult = this.documentManager.get(uri);
        if (!parseResult) {
            return { version: -1 };
        }

        const scopeSet = new Set<SysMLModelScope>(
            scopes && scopes.length > 0
                ? scopes
                : ['elements', 'relationships', 'sequenceDiagrams', 'activityDiagrams', 'resolvedTypes', 'diagnostics'],
        );

        // Build (or retrieve cached) symbol table from parse result
        const symbolTable = this._getSymbolTable(uri, parseResult);

        const text = this.documentManager.getText(uri) ?? '';

        const result: SysMLModelResult = { version };

        // --- Elements ---
        if (scopeSet.has('elements')) {
            result.elements = this.convertToElementDTOs(symbolTable, uri, text);
        }

        // --- Relationships ---
        if (scopeSet.has('relationships')) {
            result.relationships = this.extractRelationships(symbolTable, uri, text);
        }

        // --- Sequence Diagrams ---
        if (scopeSet.has('sequenceDiagrams')) {
            result.sequenceDiagrams = this.extractSequenceDiagrams(symbolTable, uri);
        }

        // --- Activity Diagrams ---
        if (scopeSet.has('activityDiagrams')) {
            result.activityDiagrams = this.extractActivityDiagrams(symbolTable, uri);
        }

        // --- Resolved Types ---
        if (scopeSet.has('resolvedTypes')) {
            result.resolvedTypes = this.extractResolvedTypes(symbolTable, uri);
        }

        // --- Semantic Diagnostics ---
        if (scopeSet.has('diagnostics')) {
            result.diagnostics = this.extractSemanticDiagnostics(symbolTable, uri, text);
        }

        // --- Stats ---
        const allSymbols = symbolTable.getSymbolsForUri(uri);
        const resolved = allSymbols.filter(s => s.typeNames.length > 0);
        // Use the real ANTLR parse time (from worker or lazy main-thread),
        // not the model-build time which is much smaller on cache hits.
        const parseTimeMs = this.documentManager.getParseTimeMs(uri);
        const timingBreakdown = this.documentManager.getTimingBreakdown(uri);
        const parseCached = this.documentManager.wasCached();
        const modelBuildTimeMs = Date.now() - startTime;

        result.stats = {
            totalElements: allSymbols.length,
            resolvedElements: resolved.length,
            unresolvedElements: allSymbols.length - resolved.length,
            parseTimeMs,
            lexTimeMs: timingBreakdown.lexMs,
            parseOnlyTimeMs: timingBreakdown.parseMs,
            parseCached,
            modelBuildTimeMs,
            complexity: analyseComplexity(allSymbols),
        };

        return result;
    }

    // -----------------------------------------------------------------------
    // Element Tree Conversion
    // -----------------------------------------------------------------------

    /**
     * Convert the symbol table into a recursive element tree.
     *
     * The symbol table stores a flat list with `parentQualifiedName` pointers.
     * We rebuild the tree by grouping symbols by parent and recursively
     * attaching children.
     */
    private convertToElementDTOs(
        symbolTable: SymbolTable,
        uri: string,
        text: string,
    ): SysMLElementDTO[] {
        const symbols = symbolTable.getSymbolsForUri(uri);

        // Index symbols by qualified name
        const byQualifiedName = new Map<string, SysMLSymbol>();
        for (const sym of symbols) {
            byQualifiedName.set(sym.qualifiedName, sym);
        }

        // Build parent → children index from parentQualifiedName
        const childrenOf = new Map<string, SysMLSymbol[]>();
        for (const sym of symbols) {
            if (sym.parentQualifiedName && byQualifiedName.has(sym.parentQualifiedName)) {
                const list = childrenOf.get(sym.parentQualifiedName) ?? [];
                list.push(sym);
                childrenOf.set(sym.parentQualifiedName, list);
            }
        }

        // Find roots: symbols with no parent or whose parent is not in this URI
        const roots = symbols.filter(
            s => !s.parentQualifiedName || !byQualifiedName.has(s.parentQualifiedName),
        );

        return roots.map(s => this.symbolToElementDTO(s, childrenOf, text));
    }

    /**
     * Convert a single SysMLSymbol into an SysMLElementDTO, recursively
     * including children.
     */
    private symbolToElementDTO(
        symbol: SysMLSymbol,
        childrenOf: Map<string, SysMLSymbol[]>,
        text: string,
    ): SysMLElementDTO {
        // Build children recursively from the parent→children index
        const childSymbols = (childrenOf.get(symbol.qualifiedName) ?? [])
            // B1: Filter phantom self-referencing package children
            .filter(c => c.qualifiedName !== symbol.qualifiedName);
        const children: SysMLElementDTO[] = childSymbols.map(c =>
            this.symbolToElementDTO(c, childrenOf, text),
        );

        // Build attributes
        const attributes: Record<string, string | number | boolean> = {};

        if (symbol.typeNames.length > 0) {
            // Determine correct attribute key based on kind
            // Store all type names as comma-separated string
            const typeLabel = symbol.typeNames.join(', ');
            if (symbol.kind === SysMLElementKind.PortUsage || symbol.kind === SysMLElementKind.PortDef) {
                attributes['portType'] = typeLabel;
            } else {
                attributes['partType'] = typeLabel;
            }
        }

        if (symbol.documentation) {
            attributes['documentation'] = symbol.documentation;
        }

        // Extract direction for ports from the source text
        const direction = this.extractDirection(symbol, text);
        if (direction) {
            attributes['direction'] = direction;
        }

        // Extract multiplicity from the source text
        const multiplicity = this.extractMultiplicity(symbol, text);
        if (multiplicity) {
            attributes['multiplicity'] = multiplicity;
        }

        // Extract modifiers
        const modifier = this.extractModifier(symbol, text);
        if (modifier) {
            attributes['modifier'] = modifier;
        }

        // Extract visibility
        const visibility = this.extractVisibility(symbol, text);
        if (visibility) {
            attributes['visibility'] = visibility;
        }

        // Extract value
        const value = this.extractValue(symbol, text);
        if (value) {
            attributes['value'] = value;
        }

        // Inline relationships for this element
        const relationships: RelationshipDTO[] = [];

        // Typing relationships (part x : Type, or defined by A, B)
        for (const tn of symbol.typeNames) {
            relationships.push({
                type: 'typing',
                source: symbol.name,
                target: tn,
            });
        }

        // Specialization (detected from text ":>" / "specializes" syntax)
        const specializations = this.extractSpecializations(symbol, text);
        for (const spec of specializations) {
            relationships.push({
                type: 'specializes',
                source: symbol.name,
                target: spec,
            });
        }

        return {
            type: symbol.kind as string,
            name: symbol.name,
            range: this.rangeToDTO(symbol.range),
            children,
            attributes,
            relationships,
        };
    }

    // -----------------------------------------------------------------------
    // Relationship Extraction
    // -----------------------------------------------------------------------

    /**
     * Extract a flat list of relationships from the symbol table.
     * Includes typing, specialization, connections, and more.
     */
    private extractRelationships(
        symbolTable: SymbolTable,
        uri: string,
        text: string,
    ): RelationshipDTO[] {
        const symbols = symbolTable.getSymbolsForUri(uri);
        const relationships: RelationshipDTO[] = [];
        const lines = text.split('\n');

        for (const symbol of symbols) {
            // Skip packages and imports for relationship extraction —
            // their text spans child elements and causes false matches
            if (symbol.kind === SysMLElementKind.Package ||
                symbol.kind === SysMLElementKind.Import ||
                symbol.kind === SysMLElementKind.Comment ||
                symbol.kind === SysMLElementKind.Doc) {
                continue;
            }

            // Typing relationships (part x : Type, or defined by A, B)
            // Only for usages — definitions' typeName can be a false positive
            // from child element text captured by ctx.getText()
            if (symbol.typeNames.length > 0 && isUsage(symbol.kind)) {
                for (const tn of symbol.typeNames) {
                    relationships.push({
                        type: 'typing',
                        source: symbol.name,
                        target: tn,
                    });
                }
            }

            // Specialization (part def X :> Y, Z  or  specializes Y, Z)
            const specializations = this.extractSpecializations(symbol, text);
            for (const spec of specializations) {
                relationships.push({
                    type: 'specializes',
                    source: symbol.name,
                    target: spec,
                });
            }

            // Connection usages create connection relationships
            if (symbol.kind === SysMLElementKind.ConnectionUsage) {
                const connectionTargets = this.extractConnectionEndpoints(symbol, text);
                if (connectionTargets.length === 2) {
                    relationships.push({
                        type: 'connection',
                        source: connectionTargets[0],
                        target: connectionTargets[1],
                        name: symbol.name,
                    });
                }
            }

            // Allocation usages create allocation relationships
            if (symbol.kind === SysMLElementKind.AllocationUsage) {
                const allocTargets = this.extractConnectionEndpoints(symbol, text);
                if (allocTargets.length === 2) {
                    relationships.push({
                        type: 'allocation',
                        source: allocTargets[0],
                        target: allocTargets[1],
                        name: symbol.name,
                    });
                }
            }

            // Scan for relationship keywords in the element text
            const elementText = this.getElementText(symbol, lines);
            const additionalRels = this.extractKeywordRelationships(symbol.name, elementText);
            relationships.push(...additionalRels);
        }

        return relationships;
    }

    // -----------------------------------------------------------------------
    // Sequence Diagram Extraction
    // -----------------------------------------------------------------------

    /**
     * Extract sequence diagram data from the symbol table.
     *
     * Sequence diagrams are built from:
     * 1. Action definitions/usages with explicit send/accept message patterns
     * 2. Synthesised from action definitions that have first/then/done flows
     *    (flow-to-sequence synthesis — matches ANTLR behaviour)
     */
    private extractSequenceDiagrams(
        symbolTable: SymbolTable,
        uri: string,
    ): SequenceDiagramDTO[] {
        const symbols = symbolTable.getSymbolsForUri(uri);
        const diagrams: SequenceDiagramDTO[] = [];
        const text = this.documentManager.getText(uri) ?? '';
        const lines = text.split('\n');
        const seen = new Set<string>();

        for (const symbol of symbols) {
            if (symbol.kind !== SysMLElementKind.ActionDef &&
                symbol.kind !== SysMLElementKind.ActionUsage) {
                continue;
            }

            const children = this.getChildSymbols(symbol, symbolTable);
            const participants: ParticipantDTO[] = [];
            const messages: MessageDTO[] = [];

            // Parts/items inside an action are participants
            for (const child of children) {
                if (child.kind === SysMLElementKind.PartUsage ||
                    child.kind === SysMLElementKind.ItemUsage) {
                    participants.push({
                        name: child.name,
                        type: child.typeNames.join(', ') || child.kind,
                        range: this.rangeToDTO(child.range),
                    });
                }
            }

            // ── D4: Extract send/accept messages from full body text ──
            const fullText = this.getFullElementText(symbol, lines);
            let occurrence = 1;

            // Broader send patterns: send <signal> via|to <target>
            const sendRe = /\bsend\s+(\w[\w.]*)\s+(?:via|to)\s+(\w[\w.]*)/gi;
            let sm: RegExpExecArray | null;
            while ((sm = sendRe.exec(fullText)) !== null) {
                messages.push({
                    name: `send_${occurrence}`,
                    from: symbol.name,
                    to: sm[2],
                    payload: sm[1],
                    occurrence: occurrence++,
                    range: this.rangeToDTO(symbol.range),
                });
            }

            // Broader accept patterns: accept <signal> via|from <source>
            const acceptRe = /\baccept\s+(\w[\w.]*)\s+(?:via|from)\s+(\w[\w.]*)/gi;
            while ((sm = acceptRe.exec(fullText)) !== null) {
                messages.push({
                    name: `accept_${occurrence}`,
                    from: sm[2],
                    to: symbol.name,
                    payload: sm[1],
                    occurrence: occurrence++,
                    range: this.rangeToDTO(symbol.range),
                });
            }

            // Also check child action usages for send/accept in their text
            for (const child of children) {
                if (child.kind === SysMLElementKind.ActionUsage) {
                    const childText = this.getFullElementText(child, lines);
                    const childSendRe = /\bsend\s+(\w[\w.]*)\s+(?:via|to)\s+(\w[\w.]*)/gi;
                    let cm: RegExpExecArray | null;
                    while ((cm = childSendRe.exec(childText)) !== null) {
                        messages.push({
                            name: child.name,
                            from: cm[2] ?? symbol.name,
                            to: cm[1] ?? '',
                            payload: cm[1] ?? '',
                            occurrence: occurrence++,
                            range: this.rangeToDTO(child.range),
                        });
                    }
                    const childAcceptRe = /\baccept\s+(\w[\w.]*)\s+(?:via|from)\s+(\w[\w.]*)/gi;
                    while ((cm = childAcceptRe.exec(childText)) !== null) {
                        messages.push({
                            name: child.name,
                            from: cm[2] ?? '',
                            to: symbol.name,
                            payload: cm[1] ?? '',
                            occurrence: occurrence++,
                            range: this.rangeToDTO(child.range),
                        });
                    }
                }
            }

            // Only include as explicit sequence diagram if it has participants or messages
            if (participants.length > 0 || messages.length > 0) {
                diagrams.push({
                    name: symbol.name,
                    participants,
                    messages,
                    range: this.rangeToDTO(symbol.range),
                });
                // Only mark as fully handled if it has real messages;
                // items-only diagrams (0 messages) can be enriched by D3 synthesis
                if (messages.length > 0) {
                    seen.add(symbol.qualifiedName);
                }
            }
        }

        // ── D3: Flow-to-sequence synthesis ──
        // For action defs with first/then flows, synthesise a sequence diagram
        // using action children as participants and flow edges as messages.
        for (const symbol of symbols) {
            if (seen.has(symbol.qualifiedName)) continue;
            if (symbol.kind !== SysMLElementKind.ActionDef &&
                symbol.kind !== SysMLElementKind.ActionUsage) {
                continue;
            }

            const children = this.getChildSymbols(symbol, symbolTable);
            const hasChildActions = children.some(c =>
                c.kind === SysMLElementKind.ActionUsage || c.kind === SysMLElementKind.ActionDef,
            );
            if (!hasChildActions) continue;

            // Extract flows to check if this action has succession patterns
            const flows = this.extractSuccessions(symbol, text, lines);
            if (flows.length === 0) continue;

            // Build participants from child actions (excluding synthetic nodes)
            const participants: ParticipantDTO[] = children
                .filter(c => c.kind === SysMLElementKind.ActionUsage || c.kind === SysMLElementKind.ActionDef)
                .map(c => ({
                    name: c.name,
                    type: c.typeNames.join(', ') || 'action',
                    range: this.rangeToDTO(c.range),
                }));

            // Build messages from flow edges (skip synthetic start/done)
            const messages: MessageDTO[] = [];
            let occ = 1;
            for (const flow of flows) {
                if (flow.from === 'start' || flow.to === 'done') continue;
                // Use the guard as the message label if present,
                // otherwise use the target action name (more meaningful
                // on a sequence diagram than a generic "flow_N" label).
                const label = flow.guard ?? flow.to;
                messages.push({
                    name: label,
                    from: flow.from,
                    to: flow.to,
                    payload: flow.guard ?? '',
                    occurrence: occ++,
                    range: flow.range,
                });
            }

            if (participants.length > 0 || messages.length > 0) {
                // Remove any items-only entry from the first pass for this symbol
                const existingIdx = diagrams.findIndex(d => d.name === symbol.name);
                if (existingIdx >= 0) {
                    diagrams.splice(existingIdx, 1);
                }
                diagrams.push({
                    name: symbol.name,
                    participants,
                    messages,
                    range: this.rangeToDTO(symbol.range),
                });
            }
        }

        return diagrams;
    }

    // -----------------------------------------------------------------------
    // Activity Diagram Extraction
    // -----------------------------------------------------------------------

    /**
     * Extract activity diagram data from action definitions and usages.
     *
     * D2: Now also includes ActionUsage elements that have child actions
     * (not just ActionDef), to capture perform actions and inline activities.
     */
    private extractActivityDiagrams(
        symbolTable: SymbolTable,
        uri: string,
    ): ActivityDiagramDTO[] {
        const symbols = symbolTable.getSymbolsForUri(uri);
        const diagrams: ActivityDiagramDTO[] = [];
        const text = this.documentManager.getText(uri) ?? '';
        const lines = text.split('\n');

        for (const symbol of symbols) {
            // D2: Include both ActionDef and ActionUsage with child actions
            if (symbol.kind !== SysMLElementKind.ActionDef &&
                symbol.kind !== SysMLElementKind.ActionUsage) {
                continue;
            }

            const children = this.getChildSymbols(symbol, symbolTable);
            const hasChildActions = children.some(c =>
                c.kind === SysMLElementKind.ActionUsage || c.kind === SysMLElementKind.ActionDef,
            );

            // For action usages, only include if they have child actions
            // (simple leaf actions like `action mount;` are not diagrams)
            if (symbol.kind === SysMLElementKind.ActionUsage && !hasChildActions) {
                continue;
            }

            const actions: ActivityActionDTO[] = [];
            const decisions: DecisionNodeDTO[] = [];
            const flows: ControlFlowDTO[] = [];
            const states: ActivityStateDTO[] = [];

            for (const child of children) {
                const childText = this.getElementText(child, lines);

                if (child.kind === SysMLElementKind.ActionUsage ||
                    child.kind === SysMLElementKind.ActionDef) {
                    // Determine action node type
                    let actionType = 'action';
                    const lowerText = childText.toLowerCase();
                    if (lowerText.includes('fork')) actionType = 'fork';
                    else if (lowerText.includes('join')) actionType = 'join';
                    else if (lowerText.includes('merge')) actionType = 'merge';
                    else if (lowerText.includes('decide')) actionType = 'decision';

                    const subActions = this.getChildSymbols(child, symbolTable)
                        .filter(c => c.kind === SysMLElementKind.ActionUsage || c.kind === SysMLElementKind.ActionDef)
                        .map(c => this.symbolToActionDTO(c, symbolTable, lines));

                    actions.push({
                        name: child.name,
                        type: actionType,
                        isDefinition: child.kind === SysMLElementKind.ActionDef,
                        range: this.rangeToDTO(child.range),
                        parent: symbol.name,
                        children: subActions.map(a => a.name),
                        subActions: subActions.length > 0 ? subActions : undefined,
                    });

                    // Decision nodes
                    if (actionType === 'decision') {
                        const branches = this.extractDecisionBranches(child, text);
                        decisions.push({
                            name: child.name,
                            condition: '',
                            branches,
                            range: this.rangeToDTO(child.range),
                        });
                    }
                }

                if (child.kind === SysMLElementKind.StateUsage ||
                    child.kind === SysMLElementKind.StateDef) {
                    const stateType = childText.toLowerCase().includes('initial')
                        ? 'initial'
                        : childText.toLowerCase().includes('final')
                            ? 'final'
                            : 'intermediate';
                    states.push({
                        name: child.name,
                        type: stateType,
                        range: this.rangeToDTO(child.range),
                    });
                }
            }

            // D1: Extract flows from succession relationships in text
            const successionFlows = this.extractSuccessions(symbol, text, lines);
            flows.push(...successionFlows);

            // D1: Extract decide/if/merge patterns for decisions
            const fullText = this.getFullElementText(symbol, lines);
            if (/\bdecide\s*;/.test(fullText)) {
                const ifRe = /\bif\s+(.+?)\s+then\s+(\w+)\s*;/g;
                const branches: { condition: string; target: string }[] = [];
                let dm: RegExpExecArray | null;
                while ((dm = ifRe.exec(fullText)) !== null) {
                    branches.push({ condition: dm[1].trim(), target: dm[2] });
                }
                if (branches.length > 0) {
                    decisions.push({
                        name: 'decide',
                        condition: '',
                        branches,
                        range: this.rangeToDTO(symbol.range),
                    });
                }
            }

            // D1: Add synthetic start/done control nodes when flows exist
            if (flows.length > 0) {
                const hasStartFlow = flows.some(f => f.from === 'start');
                const hasDoneFlow = flows.some(f => f.to === 'done');

                if (hasStartFlow) {
                    actions.unshift({
                        name: 'start',
                        type: 'initial',
                        isDefinition: false,
                        range: this.rangeToDTO(symbol.range),
                    });
                }
                if (hasDoneFlow) {
                    actions.push({
                        name: 'done',
                        type: 'final',
                        isDefinition: false,
                        range: this.rangeToDTO(symbol.range),
                    });
                }

                // Also add decide node as a special action if present
                if (flows.some(f => f.from === 'decide')) {
                    actions.push({
                        name: 'decide',
                        type: 'decision',
                        isDefinition: false,
                        range: this.rangeToDTO(symbol.range),
                    });
                }
            }

            if (actions.length > 0 || flows.length > 0 || states.length > 0) {
                diagrams.push({
                    name: symbol.name,
                    actions,
                    decisions,
                    flows,
                    states,
                    range: this.rangeToDTO(symbol.range),
                });
            }
        }

        return diagrams;
    }

    // -----------------------------------------------------------------------
    // Resolved Types Extraction
    // -----------------------------------------------------------------------

    /**
     * Extract resolved type information from the symbol table.
     *
     * This provides specialization chains and feature lists for definitions.
     * Because the LSP server doesn't yet have a full type resolver or library
     * index, we provide what's available from the parse tree.
     */
    private extractResolvedTypes(
        symbolTable: SymbolTable,
        uri: string,
    ): Record<string, ResolvedTypeDTO> {
        const symbols = symbolTable.getSymbolsForUri(uri);
        const result: Record<string, ResolvedTypeDTO> = {};
        const text = this.documentManager.getText(uri) ?? '';

        for (const symbol of symbols) {
            // Only include definitions and typed usages
            if (!isDefinition(symbol.kind) && symbol.typeNames.length === 0) {
                continue;
            }

            const specializes: string[] = [];
            const specList = this.extractSpecializations(symbol, text);
            for (const s of specList) {
                if (!specializes.includes(s)) { specializes.push(s); }
            }
            for (const tn of symbol.typeNames) {
                if (!specializes.includes(tn)) { specializes.push(tn); }
            }

            // Build specialization chain (currently single-level without library)
            const specializationChain = [...specializes];

            // Collect features (child attributes, ports, etc.)
            const children = this.getChildSymbols(symbol, symbolTable);
            const features: ResolvedFeatureDTO[] = children
                .filter(c => isUsage(c.kind))
                .map(c => ({
                    name: c.name,
                    kind: this.featureKindFromElementKind(c.kind),
                    type: c.typeNames.join(', ') || undefined,
                    isDerived: false,
                    isReadonly: false,
                }));

            result[symbol.qualifiedName] = {
                qualifiedName: symbol.qualifiedName,
                simpleName: symbol.name,
                kind: symbol.kind,
                isLibraryType: false,
                specializationChain,
                specializes,
                features,
            };
        }

        return result;
    }

    // -----------------------------------------------------------------------
    // Semantic Diagnostics
    // -----------------------------------------------------------------------

    /**
     * Extract semantic diagnostics beyond syntax errors.
     * Includes type resolution warnings, enum keyword validation, etc.
     */
    private extractSemanticDiagnostics(
        symbolTable: SymbolTable,
        uri: string,
        _text: string,
    ): SemanticDiagnosticDTO[] {
        const symbols = symbolTable.getSymbolsForUri(uri);
        const diagnostics: SemanticDiagnosticDTO[] = [];
        const allSymbolNames = new Set(symbolTable.getAllSymbols().map(s => s.name));

        for (const symbol of symbols) {
            // Check for unresolved type references (check all typeNames)
            for (const tn of symbol.typeNames) {
                if (!allSymbolNames.has(tn)) {
                    diagnostics.push({
                        code: 'unresolved-type',
                        message: `Type '${tn}' could not be resolved in the current scope`,
                        severity: 'warning',
                        range: this.rangeToDTO(symbol.selectionRange),
                        elementName: symbol.name,
                    });
                }
            }

            // Enum definitions without any enum values
            if (symbol.kind === SysMLElementKind.EnumDef) {
                const children = this.getChildSymbols(symbol, symbolTable);
                const hasEnumValues = children.some(c =>
                    c.kind === SysMLElementKind.EnumUsage ||
                    c.kind === SysMLElementKind.AttributeUsage,
                );
                if (!hasEnumValues) {
                    diagnostics.push({
                        code: 'empty-enum',
                        message: `Enumeration '${symbol.name}' has no enum values defined`,
                        severity: 'info',
                        range: this.rangeToDTO(symbol.range),
                        elementName: symbol.name,
                    });
                }
            }
        }

        return diagnostics;
    }

    // -----------------------------------------------------------------------
    // Helper Methods
    // -----------------------------------------------------------------------

    /** Convert LSP Range → RangeDTO. */
    private rangeToDTO(range: Range): RangeDTO {
        return {
            start: { line: range.start.line, character: range.start.character },
            end: { line: range.end.line, character: range.end.character },
        };
    }

    /** Get child symbols for a given parent symbol. */
    private getChildSymbols(parent: SysMLSymbol, symbolTable: SymbolTable): SysMLSymbol[] {
        // The symbol table's children array may not be populated; use the
        // symbolsByUri list and filter by parentQualifiedName instead.
        const allSymbols = symbolTable.getSymbolsForUri(parent.uri);
        return allSymbols.filter(s => s.parentQualifiedName === parent.qualifiedName);
    }

    /**
     * Get the source text for an element's declaration line only
     * (not children's text).  This avoids over-matching on parent elements
     * whose range spans child elements.
     */
    private getElementText(symbol: SysMLSymbol, lines: string[]): string {
        const startLine = symbol.range.start.line;
        // Use only the first few lines of the element to capture its
        // declaration without including nested children's bodies.
        const endLine = Math.min(startLine + 2, symbol.range.end.line, lines.length - 1);
        return lines.slice(startLine, endLine + 1).join('\n');
    }

    /**
     * Get the full source text for an element's entire range.
     * Used when we need to scan the whole body (e.g., succession flows).
     */
    private getFullElementText(symbol: SysMLSymbol, lines: string[]): string {
        const startLine = symbol.range.start.line;
        const endLine = Math.min(symbol.range.end.line, lines.length - 1);
        return lines.slice(startLine, endLine + 1).join('\n');
    }

    /** Extract port direction (in | out | inout) from source text. */
    private extractDirection(symbol: SysMLSymbol, text: string): string | undefined {
        if (symbol.kind !== SysMLElementKind.PortUsage && symbol.kind !== SysMLElementKind.PortDef) {
            return undefined;
        }
        const lines = text.split('\n');
        const elementText = this.getElementText(symbol, lines);
        if (/\binout\b/.test(elementText)) return 'inout';
        if (/\bin\b/.test(elementText)) return 'in';
        if (/\bout\b/.test(elementText)) return 'out';
        return undefined;
    }

    /** Extract multiplicity (e.g., [4], [0..*]) from source text. */
    private extractMultiplicity(symbol: SysMLSymbol, text: string): string | undefined {
        const lines = text.split('\n');
        const elementText = this.getElementText(symbol, lines);
        const match = elementText.match(/\[([^\]]+)\]/);
        return match ? match[1] : undefined;
    }

    /** Extract modifiers (abstract, readonly, derived, etc.) from source text. */
    private extractModifier(symbol: SysMLSymbol, text: string): string | undefined {
        const lines = text.split('\n');
        const elementText = this.getElementText(symbol, lines);
        const modifiers: string[] = [];
        if (/\babstract\b/.test(elementText)) modifiers.push('abstract');
        if (/\breadonly\b/.test(elementText)) modifiers.push('readonly');
        if (/\bderived\b/.test(elementText)) modifiers.push('derived');
        if (/\bvariation\b/.test(elementText)) modifiers.push('variation');
        if (/\bindividual\b/.test(elementText)) modifiers.push('individual');
        return modifiers.length > 0 ? modifiers.join(', ') : undefined;
    }

    /** Extract visibility (public | private | protected) from source text. */
    private extractVisibility(symbol: SysMLSymbol, text: string): string | undefined {
        const lines = text.split('\n');
        const elementText = this.getElementText(symbol, lines);
        if (/\bprivate\b/.test(elementText)) return 'private';
        if (/\bprotected\b/.test(elementText)) return 'protected';
        if (/\bpublic\b/.test(elementText)) return 'public';
        return undefined;
    }

    /** Extract default/assigned value from source text. */
    private extractValue(symbol: SysMLSymbol, text: string): string | undefined {
        if (symbol.kind !== SysMLElementKind.AttributeUsage) {
            return undefined;
        }
        const lines = text.split('\n');
        const elementText = this.getElementText(symbol, lines);
        // Match `= value` or `:= value` pattern (attribute assignment)
        const match = elementText.match(/[:=]=?\s*([^;{}\n]+)/);
        if (match) {
            const val = match[1].trim();
            // Don't return type references as values
            if (!val.includes('def') && val.length < 100) {
                return val;
            }
        }
        return undefined;
    }

    /** Extract all specialization targets from `:>` or `specializes` syntax. */
    private extractSpecializations(symbol: SysMLSymbol, text: string): string[] {
        const lines = text.split('\n');
        const elementText = this.getElementText(symbol, lines);

        // Match `:>` syntax with comma-separated names
        const colonMatch = elementText.match(/:>\s*([A-Za-z_][\w:]*(?:\s*,\s*[A-Za-z_][\w:]*)*)/) ;
        if (colonMatch) {
            return colonMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        }

        // Match `specializes` syntax with comma-separated names
        const specMatch = elementText.match(/\bspecializes\s+([A-Za-z_][\w:]*(?:\s*,\s*[A-Za-z_][\w:]*)*)/) ;
        if (specMatch) {
            return specMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        }

        return [];
    }

    /** Extract connection endpoints from `connect` syntax. */
    private extractConnectionEndpoints(symbol: SysMLSymbol, text: string): string[] {
        const lines = text.split('\n');
        const elementText = this.getElementText(symbol, lines);
        const endpoints: string[] = [];

        // Pattern: connect X to Y
        const connectMatch = elementText.match(/\bconnect\s+(\w[\w.]*)\s+to\s+(\w[\w.]*)/);
        if (connectMatch) {
            endpoints.push(connectMatch[1], connectMatch[2]);
            return endpoints;
        }

        // Pattern: end X; end Y (connection end features)
        const endPattern = /\bend\s+(\w[\w.]*)\s*/g;
        let endMatch: RegExpExecArray | null;
        while ((endMatch = endPattern.exec(elementText)) !== null) {
            endpoints.push(endMatch[1]);
        }

        return endpoints;
    }

    /** Extract relationship keywords from element text. */
    private extractKeywordRelationships(elementName: string, elementText: string): RelationshipDTO[] {
        const rels: RelationshipDTO[] = [];

        // subsetting: `subsets X`
        const subsetMatch = elementText.match(/\bsubsets\s+([A-Za-z_][\w:]*)/);
        if (subsetMatch) {
            rels.push({ type: 'subsetting', source: elementName, target: subsetMatch[1] });
        }

        // redefinition: `redefines X`
        const redefMatch = elementText.match(/\bredefines\s+([A-Za-z_][\w:]*)/);
        if (redefMatch) {
            rels.push({ type: 'redefinition', source: elementName, target: redefMatch[1] });
        }

        // satisfy: `satisfy requirement X`
        const satisfyMatch = elementText.match(/\bsatisfy\s+(?:requirement\s+)?([A-Za-z_][\w:]*)/);
        if (satisfyMatch) {
            rels.push({ type: 'satisfy', source: elementName, target: satisfyMatch[1] });
        }

        // verify: `verify requirement X`
        const verifyMatch = elementText.match(/\bverify\s+(?:requirement\s+)?([A-Za-z_][\w:]*)/);
        if (verifyMatch) {
            rels.push({ type: 'verify', source: elementName, target: verifyMatch[1] });
        }

        return rels;
    }

    /** Extract decision branches from decision node text. */
    private extractDecisionBranches(
        symbol: SysMLSymbol,
        text: string,
    ): { condition: string; target: string }[] {
        const lines = text.split('\n');
        const elementText = this.getElementText(symbol, lines);
        const branches: { condition: string; target: string }[] = [];

        // Pattern: if <condition> then <target>
        const ifPattern = /\bif\s+([^{;]+?)\s+then\s+([A-Za-z_]\w*)/g;
        let match: RegExpExecArray | null;
        while ((match = ifPattern.exec(elementText)) !== null) {
            branches.push({ condition: match[1].trim(), target: match[2] });
        }

        // Pattern: else <target>
        const elseMatch = elementText.match(/\belse\s+([A-Za-z_]\w*)/);
        if (elseMatch) {
            branches.push({ condition: 'else', target: elseMatch[1] });
        }

        return branches;
    }

    /**
     * Extract succession (control flow) relationships from action body text.
     *
     * Handles multi-line succession chains, inline patterns, and
     * decision/merge control flow patterns:
     *   - Multi-line: `first X;` / `then Y;` / `then Z;`
     *   - Inline:     `first X then Y;`
     *   - Explicit:   `succession first X then Y;`
     *   - Decision:   `decide; if <cond> then X; merge Y;`
     *   - Quoted:     `then 'My Action';`
     */
    private extractSuccessions(
        parent: SysMLSymbol,
        _text: string,
        lines: string[],
    ): ControlFlowDTO[] {
        const elementText = this.getFullElementText(parent, lines);
        const flows: ControlFlowDTO[] = [];
        const seen = new Set<string>();
        const range = this.rangeToDTO(parent.range);

        const addFlow = (from: string, to: string, guard?: string): void => {
            // Prevent self-referencing flows (e.g. start→start, done→done)
            if (from === to) return;
            const key = `${from}->${to}`;
            if (seen.has(key)) return;
            seen.add(key);
            const f: ControlFlowDTO = { from, to, range };
            if (guard) f.guard = guard;
            flows.push(f);
        };

        // Helper: compute brace nesting depth at a given text position.
        function braceDepthAt(text: string, pos: number): number {
            let depth = 0;
            for (let i = 0; i < pos && i < text.length; i++) {
                if (text[i] === '{') depth++;
                else if (text[i] === '}') depth--;
            }
            return depth;
        }

        // Top-level depth is 1 (inside the parent element's opening brace).
        const firstBrace = elementText.indexOf('{');
        const topDepth = firstBrace >= 0
            ? braceDepthAt(elementText, firstBrace + 1)
            : 1;

        // Helper: strip qualified name prefix (e.g. "Pkg::name" → "name")
        const stripQualifier = (name: string): string => {
            const idx = name.lastIndexOf('::');
            return idx >= 0 ? name.substring(idx + 2) : name;
        };

        // ── Step 1: Collect first/then tokens in text order ──
        // Only collects tokens at the top-level brace depth to avoid
        // picking up nested `then` keywords inside if/else blocks.
        interface FlowToken { type: 'first' | 'then'; name: string; index: number }
        const tokens: FlowToken[] = [];
        let m: RegExpExecArray | null;

        // Match `first <name>` or `first '<quoted name>'`
        // Supports qualified names: `first Pkg::element`
        const firstRe = /\bfirst\s+(?:'([^']+)'|(\w+(?:::\w+)*))/g;
        while ((m = firstRe.exec(elementText)) !== null) {
            if (braceDepthAt(elementText, m.index) !== topDepth) continue;
            const name = stripQualifier(m[1] || m[2]);
            tokens.push({ type: 'first', name, index: m.index });
        }

        // Match `then [action] <name>` — skips the optional `action` keyword
        // so that `then action startBatmobile` captures "startBatmobile".
        // Also supports quoted names and qualified names.
        const thenRe = /\bthen\s+(?:action\s+)?(?:'([^']+)'|(\w+(?:::\w+)*))/g;
        while ((m = thenRe.exec(elementText)) !== null) {
            // Only process tokens at the top-level brace depth
            if (braceDepthAt(elementText, m.index) !== topDepth) continue;
            // Skip `then` that is part of `if <condition> then <target>`
            const preceding = elementText.substring(Math.max(0, m.index - 100), m.index);
            if (/\bif\b[^;]*$/i.test(preceding)) continue;
            const name = stripQualifier(m[1] || m[2]);
            // Skip `then if` — decision points handled in Step 4
            if (name === 'if') continue;
            tokens.push({ type: 'then', name, index: m.index });
        }

        tokens.sort((a, b) => a.index - b.index);

        // ── Step 2: Build succession chains from ordered tokens ──
        // Each `first` token starts a new chain; subsequent `then` tokens
        // extend it until the next `first` or end of tokens.
        // Each `first X then Y` statement produces ONLY the direct edge X→Y.
        // The start→first and last→done connections are only emitted when
        // `start` or `done` appear explicitly in the SysML text.
        const coveredIndices = new Set<number>();

        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].type === 'first') {
                const chain: string[] = [tokens[i].name];
                coveredIndices.add(i);
                for (let j = i + 1; j < tokens.length; j++) {
                    if (tokens[j].type === 'then') {
                        chain.push(tokens[j].name);
                        coveredIndices.add(j);
                    } else {
                        break; // next 'first' = different chain
                    }
                }
                // Connect each adjacent pair in the chain.
                // start/done are only connected when they appear in the text.
                for (let k = 0; k < chain.length - 1; k++) {
                    addFlow(chain[k], chain[k + 1]);
                }
            }
        }

        // Handle orphan `then` tokens not covered by a `first` chain.
        // This happens when `then action X;` appears without a preceding
        // `first` keyword (the action before it is the implicit start).
        const uncoveredThens = tokens.filter(
            (t, i) => !coveredIndices.has(i) && t.type === 'then',
        );
        if (uncoveredThens.length > 0) {
            for (let i = 0; i < uncoveredThens.length - 1; i++) {
                addFlow(uncoveredThens[i].name, uncoveredThens[i + 1].name);
            }
        }

        // ── Synthesise start→first and last→done edges ──
        // When succession chains exist, add synthetic control nodes
        // so activity diagrams have well-defined entry/exit points.
        if (flows.length > 0) {
            // Find the first action in the chain (target of no other flow)
            const allTargets = new Set(flows.map(f => f.to));
            const allSources = new Set(flows.map(f => f.from));
            const entryActions = flows
                .map(f => f.from)
                .filter(name => name !== 'start' && name !== 'done' && !allTargets.has(name));
            const exitActions = flows
                .map(f => f.to)
                .filter(name => name !== 'start' && name !== 'done' && !allSources.has(name));

            // Connect start → first entry action
            if (entryActions.length > 0) {
                addFlow('start', entryActions[0]);
            }
            // Connect last exit action → done
            if (exitActions.length > 0) {
                addFlow(exitActions[exitActions.length - 1], 'done');
            }
        }

        // ── Step 3: Explicit `succession` keyword ──
        // Handles both control successions and data flow successions:
        //   succession [first] X then Y;
        //   succession flow from X[.port] to Y[.port];
        const succRe = /\bsuccession\s+(?:first\s+)?(?:'([^']+)'|(\w+(?:::\w+)*))\s+then\s+(?:'([^']+)'|(\w+(?:::\w+)*))/g;
        while ((m = succRe.exec(elementText)) !== null) {
            addFlow(stripQualifier(m[1] || m[2]), stripQualifier(m[3] || m[4]));
        }
        // succession flow from X.port to Y.port — data flow implies control flow
        const succFlowRe = /\bsuccession\s+flow\s+from\s+(\w+)(?:\.\w+)?\s+to\s+(\w+)(?:\.\w+)?/g;
        while ((m = succFlowRe.exec(elementText)) !== null) {
            addFlow(m[1], m[2]);
        }

        // ── Step 4: Decision / merge patterns ──
        if (/\bdecide\s*;/.test(elementText)) {
            // Remove all auto-generated flows FROM 'decide' — decision
            // branches (added below) replace the direct chain edge.
            for (let fi = flows.length - 1; fi >= 0; fi--) {
                if (flows[fi].from === 'decide') {
                    seen.delete(`decide->${flows[fi].to}`);
                    flows.splice(fi, 1);
                }
            }

            // Extract decision branches: `if <cond> then <target>;`
            // Supports both simple names and quoted names for targets.
            const ifRe = /\bif\s+(.+?)\s+then\s+(?:'([^']+)'|(\w+))\s*;/g;
            const branchTargets: string[] = [];
            while ((m = ifRe.exec(elementText)) !== null) {
                const target = m[2] || m[3];
                addFlow('decide', target, m[1].trim());
                branchTargets.push(target);
            }

            // Extract merge target: `merge <target>;`
            const mergeRe = /\bmerge\s+(?:'([^']+)'|(\w+))\s*;/g;
            while ((m = mergeRe.exec(elementText)) !== null) {
                const mergeTarget = m[1] || m[2];
                for (const branch of branchTargets) {
                    addFlow(branch, mergeTarget);
                }
                // Connect merge target to next `then` in the chain
                const afterMerge = tokens.filter(
                    t => t.type === 'then' && t.index > m!.index,
                );
                if (afterMerge.length > 0) {
                    addFlow(mergeTarget, afterMerge[0].name);
                } else if (mergeTarget !== 'done') {
                    addFlow(mergeTarget, 'done');
                }
            }
        }

        return flows;
    }

    /** Convert element kind to feature kind string. */
    private featureKindFromElementKind(kind: SysMLElementKind): string {
        switch (kind) {
            case SysMLElementKind.AttributeUsage:
            case SysMLElementKind.AttributeDef:
                return 'attribute';
            case SysMLElementKind.PortUsage:
            case SysMLElementKind.PortDef:
                return 'port';
            case SysMLElementKind.ActionUsage:
            case SysMLElementKind.ActionDef:
                return 'action';
            case SysMLElementKind.StateUsage:
            case SysMLElementKind.StateDef:
                return 'state';
            default:
                return 'reference';
        }
    }

    /** Convert an action symbol to an ActivityActionDTO. */
    private symbolToActionDTO(
        symbol: SysMLSymbol,
        symbolTable: SymbolTable,
        lines: string[],
    ): ActivityActionDTO {
        const childText = this.getElementText(symbol, lines);
        let actionType = 'action';
        const lowerText = childText.toLowerCase();
        if (lowerText.includes('fork')) actionType = 'fork';
        else if (lowerText.includes('join')) actionType = 'join';
        else if (lowerText.includes('merge')) actionType = 'merge';
        else if (lowerText.includes('decide')) actionType = 'decision';

        return {
            name: symbol.name,
            type: actionType,
            isDefinition: symbol.kind === SysMLElementKind.ActionDef,
            range: this.rangeToDTO(symbol.range),
        };
    }
}
