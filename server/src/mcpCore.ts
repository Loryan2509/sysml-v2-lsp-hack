/**
 * SysML v2 MCP Server — Core Logic
 *
 * Pure functions and stateful helpers used by the MCP tool/resource/prompt
 * handlers.  Extracted from mcpServer.ts so they can be unit-tested without
 * spinning up a transport.
 */

import { parseDocument } from './parser/parseDocument.js';
import { SymbolTable } from './symbols/symbolTable.js';
import { SysMLElementKind, isDefinition, isUsage } from './symbols/sysmlElements.js';
import type { SysMLSymbol } from './symbols/sysmlElements.js';
import type { SyntaxError } from './parser/errorListener.js';

// ---------------------------------------------------------------------------
// State container — one per MCP session
// ---------------------------------------------------------------------------

export class McpContext {
    readonly symbolTable = new SymbolTable();
    readonly loadedDocuments = new Map<string, string>();
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatSymbol(sym: SysMLSymbol): Record<string, unknown> {
    return {
        name: sym.name,
        kind: sym.kind,
        qualifiedName: sym.qualifiedName,
        ...(sym.typeName ? { type: sym.typeName } : {}),
        ...(sym.documentation ? { documentation: sym.documentation } : {}),
        ...(sym.parentQualifiedName ? { parent: sym.parentQualifiedName } : {}),
        ...(sym.children.length > 0 ? { children: sym.children } : {}),
        location: {
            uri: sym.uri,
            range: sym.range,
        },
    };
}

export function formatError(err: SyntaxError): Record<string, unknown> {
    return {
        line: err.line + 1,
        column: err.column + 1,
        message: err.message,
        length: err.length,
    };
}

// ---------------------------------------------------------------------------
// Core operations — each returns the JSON-serialisable result object
// ---------------------------------------------------------------------------

export function parseAndBuild(
    ctx: McpContext,
    text: string,
    uri: string,
): { errors: SyntaxError[]; symbolCount: number; timingMs: { lex: number; parse: number } } {
    const result = parseDocument(text);
    ctx.symbolTable.build(uri, result);
    ctx.loadedDocuments.set(uri, text);
    return {
        errors: result.errors,
        symbolCount: ctx.symbolTable.getSymbolsForUri(uri).length,
        timingMs: { lex: result.timing.lexMs, parse: result.timing.parseMs },
    };
}

export function handleParse(
    ctx: McpContext,
    code: string,
    uri?: string,
): Record<string, unknown> {
    const docUri = uri ?? 'untitled.sysml';
    const { errors, symbolCount, timingMs } = parseAndBuild(ctx, code, docUri);

    const summary: Record<string, unknown> = {
        uri: docUri,
        symbolCount,
        errorCount: errors.length,
        timing: timingMs,
    };

    if (errors.length > 0) {
        summary.errors = errors.map(formatError);
    }

    const allSymbols = ctx.symbolTable.getSymbolsForUri(docUri);
    const topLevel = allSymbols
        .filter((s) => !s.parentQualifiedName)
        .map((s) => `${s.kind} ${s.qualifiedName}`);
    if (topLevel.length > 0) {
        summary.topLevelElements = topLevel;
    }

    return summary;
}

export function handleValidate(
    ctx: McpContext,
    code: string,
    uri?: string,
): { valid: boolean; errorCount: number; errors: Record<string, unknown>[] } {
    const docUri = uri ?? 'untitled.sysml';
    const { errors } = parseAndBuild(ctx, code, docUri);
    return {
        valid: errors.length === 0,
        errorCount: errors.length,
        errors: errors.map(formatError),
    };
}

export function handleGetSymbols(
    ctx: McpContext,
    opts: { kind?: string; uri?: string; definitionsOnly?: boolean; usagesOnly?: boolean },
): { count: number; symbols: Record<string, unknown>[] } {
    let symbols = opts.uri
        ? ctx.symbolTable.getSymbolsForUri(opts.uri)
        : ctx.symbolTable.getAllSymbols();

    if (opts.kind) {
        symbols = symbols.filter((s) => s.kind.toLowerCase() === opts.kind!.toLowerCase());
    }
    if (opts.definitionsOnly) {
        symbols = symbols.filter((s) => isDefinition(s.kind));
    }
    if (opts.usagesOnly) {
        symbols = symbols.filter((s) => isUsage(s.kind));
    }

    return { count: symbols.length, symbols: symbols.map(formatSymbol) };
}

export function handleGetDefinition(
    ctx: McpContext,
    name: string,
): Record<string, unknown> {
    const exact = ctx.symbolTable.getSymbol(name);
    if (exact) {
        return formatSymbol(exact);
    }

    const matches = ctx.symbolTable.findByName(name);
    if (matches.length === 0) {
        return { found: false, message: `No symbol found with name "${name}"` };
    }
    return { found: true, count: matches.length, symbols: matches.map(formatSymbol) };
}

export function handleGetReferences(
    ctx: McpContext,
    name: string,
): { name: string; referenceCount: number; references: Record<string, unknown>[] } {
    const refs = ctx.symbolTable.findReferences(name);
    return { name, referenceCount: refs.length, references: refs.map(formatSymbol) };
}

export function handleGetHierarchy(
    ctx: McpContext,
    name: string,
): Record<string, unknown> {
    const exact = ctx.symbolTable.getSymbol(name);
    const target = exact ?? ctx.symbolTable.findByName(name)[0];

    if (!target) {
        return { found: false, message: `No symbol "${name}" found` };
    }

    const ancestors: Array<{ name: string; kind: string; qualifiedName: string }> = [];
    let current = target.parentQualifiedName;
    while (current) {
        const parent = ctx.symbolTable.getSymbol(current);
        if (!parent) break;
        ancestors.unshift({ name: parent.name, kind: parent.kind, qualifiedName: parent.qualifiedName });
        current = parent.parentQualifiedName;
    }

    const children = target.children
        .map((qn) => ctx.symbolTable.getSymbol(qn))
        .filter((s): s is SysMLSymbol => s !== undefined)
        .map((s) => ({
            name: s.name,
            kind: s.kind,
            qualifiedName: s.qualifiedName,
            ...(s.typeName ? { type: s.typeName } : {}),
        }));

    return {
        element: {
            name: target.name,
            kind: target.kind,
            qualifiedName: target.qualifiedName,
            ...(target.typeName ? { type: target.typeName } : {}),
        },
        ancestors,
        children,
    };
}

export function handleGetModelSummary(
    ctx: McpContext,
): Record<string, unknown> {
    const allSymbols = ctx.symbolTable.getAllSymbols();
    const kindCounts: Record<string, number> = {};
    for (const sym of allSymbols) {
        kindCounts[sym.kind] = (kindCounts[sym.kind] ?? 0) + 1;
    }
    const sorted = Object.entries(kindCounts).sort(([, a], [, b]) => b - a);
    return {
        totalSymbols: allSymbols.length,
        loadedDocuments: Array.from(ctx.loadedDocuments.keys()),
        elementsByKind: Object.fromEntries(sorted),
        definitions: allSymbols.filter((s) => isDefinition(s.kind)).length,
        usages: allSymbols.filter((s) => isUsage(s.kind)).length,
    };
}

// ---------------------------------------------------------------------------
// Resource data helpers
// ---------------------------------------------------------------------------

export function getElementKinds(): { definitions: string[]; usages: string[]; other: string[]; total: number } {
    const kinds = Object.values(SysMLElementKind);
    return {
        definitions: kinds.filter((k) => isDefinition(k)),
        usages: kinds.filter((k) => isUsage(k)),
        other: kinds.filter((k) => !isDefinition(k) && !isUsage(k)),
        total: kinds.length,
    };
}

export const SYSML_KEYWORDS = [
    'about', 'abstract', 'accept', 'action', 'actor', 'after', 'alias',
    'all', 'allocate', 'allocation', 'analysis', 'and', 'as', 'assert',
    'assign', 'assume', 'attribute', 'bind', 'binding', 'bool', 'by',
    'calc', 'case', 'comment', 'concern', 'connect', 'connection',
    'constraint', 'decide', 'def', 'default', 'defined', 'dependency',
    'derived', 'do', 'doc', 'else', 'end', 'entry', 'enum', 'event',
    'exhibit', 'exit', 'expose', 'false', 'feature', 'filter', 'first',
    'flow', 'for', 'fork', 'frame', 'from', 'hastype', 'if', 'implies',
    'import', 'in', 'include', 'individual', 'inout', 'interface',
    'istype', 'item', 'join', 'language', 'library', 'locale', 'merge',
    'message', 'meta', 'metadata', 'multiplicity', 'namespace', 'nonunique',
    'not', 'null', 'objective', 'occurrence', 'of', 'or', 'ordered', 'out',
    'package', 'parallel', 'part', 'perform', 'port', 'private',
    'protected', 'public', 'readonly', 'redefines', 'ref', 'references',
    'render', 'rendering', 'rep', 'require', 'requirement', 'return',
    'satisfy', 'send', 'snapshot', 'specializes', 'stakeholder', 'state',
    'subject', 'subsets', 'succession', 'then', 'timeslice', 'to', 'transition',
    'true', 'type', 'use', 'variant', 'variation', 'verification', 'verify',
    'view', 'viewpoint', 'when', 'while', 'xor',
] as const;
