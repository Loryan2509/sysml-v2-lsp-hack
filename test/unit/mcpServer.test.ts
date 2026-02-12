import { describe, it, expect, beforeEach } from 'vitest';

describe('MCP Server Core', () => {
    let McpContext: typeof import('../../server/src/mcpCore.js').McpContext;
    let handleParse: typeof import('../../server/src/mcpCore.js').handleParse;
    let handleValidate: typeof import('../../server/src/mcpCore.js').handleValidate;
    let handleGetSymbols: typeof import('../../server/src/mcpCore.js').handleGetSymbols;
    let handleGetDefinition: typeof import('../../server/src/mcpCore.js').handleGetDefinition;
    let handleGetReferences: typeof import('../../server/src/mcpCore.js').handleGetReferences;
    let handleGetHierarchy: typeof import('../../server/src/mcpCore.js').handleGetHierarchy;
    let handleGetModelSummary: typeof import('../../server/src/mcpCore.js').handleGetModelSummary;
    let getElementKinds: typeof import('../../server/src/mcpCore.js').getElementKinds;
    let SYSML_KEYWORDS: typeof import('../../server/src/mcpCore.js').SYSML_KEYWORDS;
    let formatSymbol: typeof import('../../server/src/mcpCore.js').formatSymbol;
    let formatError: typeof import('../../server/src/mcpCore.js').formatError;

    let ctx: InstanceType<typeof McpContext>;

    beforeEach(async () => {
        const mod = await import('../../server/src/mcpCore.js');
        McpContext = mod.McpContext;
        handleParse = mod.handleParse;
        handleValidate = mod.handleValidate;
        handleGetSymbols = mod.handleGetSymbols;
        handleGetDefinition = mod.handleGetDefinition;
        handleGetReferences = mod.handleGetReferences;
        handleGetHierarchy = mod.handleGetHierarchy;
        handleGetModelSummary = mod.handleGetModelSummary;
        getElementKinds = mod.getElementKinds;
        SYSML_KEYWORDS = mod.SYSML_KEYWORDS;
        formatSymbol = mod.formatSymbol;
        formatError = mod.formatError;

        // Fresh context for each test — no shared state leaking between tests
        ctx = new McpContext();
    });

    const VALID_MODEL = `package Camera {
    part def CameraSystem {
        attribute resolution : String;
        port viewfinder : ViewPort;
    }
    part def ViewPort;
    part camera : CameraSystem;
}`;

    const INVALID_MODEL = `part def Broken {
    attribute x :
`;

    // -----------------------------------------------------------------------
    // parse tool
    // -----------------------------------------------------------------------

    describe('handleParse', () => {
        it('should parse valid SysML and return symbol count', () => {
            const result = handleParse(ctx, VALID_MODEL);
            expect(result.errorCount).toBe(0);
            expect(result.symbolCount).toBeGreaterThan(0);
            expect(result.uri).toBe('untitled.sysml');
            expect(result.timing).toBeDefined();
        });

        it('should use provided URI', () => {
            const result = handleParse(ctx, VALID_MODEL, 'file:///camera.sysml');
            expect(result.uri).toBe('file:///camera.sysml');
        });

        it('should report top-level elements', () => {
            const result = handleParse(ctx, VALID_MODEL);
            expect(result.topLevelElements).toBeDefined();
            const topLevel = result.topLevelElements as string[];
            expect(topLevel.some((e) => e.includes('Camera'))).toBe(true);
        });

        it('should report errors for invalid syntax', () => {
            const result = handleParse(ctx, INVALID_MODEL);
            expect(result.errorCount).toBeGreaterThan(0);
            expect(result.errors).toBeDefined();
            const errors = result.errors as Array<Record<string, unknown>>;
            expect(errors[0].line).toBeGreaterThan(0);
            expect(errors[0].message).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // validate tool
    // -----------------------------------------------------------------------

    describe('handleValidate', () => {
        it('should return valid=true for correct input', () => {
            const result = handleValidate(ctx, VALID_MODEL);
            expect(result.valid).toBe(true);
            expect(result.errorCount).toBe(0);
            expect(result.errors).toEqual([]);
        });

        it('should return valid=false with errors for bad input', () => {
            const result = handleValidate(ctx, INVALID_MODEL);
            expect(result.valid).toBe(false);
            expect(result.errorCount).toBeGreaterThan(0);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    // -----------------------------------------------------------------------
    // getSymbols tool
    // -----------------------------------------------------------------------

    describe('handleGetSymbols', () => {
        beforeEach(() => {
            handleParse(ctx, VALID_MODEL, 'test.sysml');
        });

        it('should return all symbols', () => {
            const result = handleGetSymbols(ctx, {});
            expect(result.count).toBeGreaterThan(0);
            expect(result.symbols.length).toBe(result.count);
        });

        it('should filter by uri', () => {
            const result = handleGetSymbols(ctx, { uri: 'test.sysml' });
            expect(result.count).toBeGreaterThan(0);
            const empty = handleGetSymbols(ctx, { uri: 'nonexistent.sysml' });
            expect(empty.count).toBe(0);
        });

        it('should filter by kind', () => {
            const result = handleGetSymbols(ctx, { kind: 'part def' });
            expect(result.count).toBeGreaterThan(0);
            result.symbols.forEach((s) => {
                expect(s.kind).toBe('part def');
            });
        });

        it('should filter definitions only', () => {
            const result = handleGetSymbols(ctx, { definitionsOnly: true });
            expect(result.count).toBeGreaterThan(0);
            result.symbols.forEach((s) => {
                expect((s.kind as string).endsWith(' def')).toBe(true);
            });
        });

        it('should filter usages only', () => {
            const result = handleGetSymbols(ctx, { usagesOnly: true });
            expect(result.count).toBeGreaterThan(0);
            result.symbols.forEach((s) => {
                expect((s.kind as string).endsWith(' def')).toBe(false);
            });
        });
    });

    // -----------------------------------------------------------------------
    // getDefinition tool
    // -----------------------------------------------------------------------

    describe('handleGetDefinition', () => {
        beforeEach(() => {
            handleParse(ctx, VALID_MODEL, 'test.sysml');
        });

        it('should find by qualified name', () => {
            const result = handleGetDefinition(ctx, 'Camera::CameraSystem');
            expect(result.qualifiedName).toBe('Camera::CameraSystem');
            expect(result.kind).toBe('part def');
        });

        it('should find by simple name', () => {
            const result = handleGetDefinition(ctx, 'CameraSystem');
            expect(result.found).toBe(true);
            expect((result as { count: number }).count).toBeGreaterThanOrEqual(1);
        });

        it('should return not-found for unknown name', () => {
            const result = handleGetDefinition(ctx, 'NonExistent');
            expect(result.found).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // getReferences tool
    // -----------------------------------------------------------------------

    describe('handleGetReferences', () => {
        beforeEach(() => {
            handleParse(ctx, VALID_MODEL, 'test.sysml');
        });

        it('should find references by name', () => {
            const result = handleGetReferences(ctx, 'CameraSystem');
            expect(result.name).toBe('CameraSystem');
            expect(result.referenceCount).toBeGreaterThanOrEqual(1);
            expect(result.references.length).toBe(result.referenceCount);
        });

        it('should return zero references for unknown name', () => {
            const result = handleGetReferences(ctx, 'Unknown');
            expect(result.referenceCount).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // getHierarchy tool
    // -----------------------------------------------------------------------

    describe('handleGetHierarchy', () => {
        beforeEach(() => {
            handleParse(ctx, VALID_MODEL, 'test.sysml');
        });

        it('should return hierarchy for a nested element', () => {
            const result = handleGetHierarchy(ctx, 'CameraSystem') as {
                element: { name: string; kind: string };
                ancestors: Array<{ name: string }>;
                children: Array<{ name: string }>;
            };
            expect(result.element).toBeDefined();
            expect(result.element.name).toBe('CameraSystem');
            expect(result.ancestors.length).toBeGreaterThan(0);
            expect(result.ancestors[0].name).toBe('Camera');
        });

        it('should return hierarchy for a root element', () => {
            const result = handleGetHierarchy(ctx, 'Camera') as {
                element: { name: string };
                ancestors: Array<{ name: string }>;
            };
            expect(result.element.name).toBe('Camera');
            expect(result.ancestors.length).toBe(0);
        });

        it('should return not-found for unknown name', () => {
            const result = handleGetHierarchy(ctx, 'NonExistent') as { found: boolean };
            expect(result.found).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // getModelSummary tool
    // -----------------------------------------------------------------------

    describe('handleGetModelSummary', () => {
        it('should return empty summary before parsing', () => {
            const result = handleGetModelSummary(ctx);
            expect(result.totalSymbols).toBe(0);
            expect((result.loadedDocuments as string[]).length).toBe(0);
        });

        it('should return summary after parsing', () => {
            handleParse(ctx, VALID_MODEL, 'cam.sysml');
            const result = handleGetModelSummary(ctx);
            expect(result.totalSymbols).toBeGreaterThan(0);
            expect(result.loadedDocuments).toContain('cam.sysml');
            expect(result.elementsByKind).toBeDefined();
            expect((result.definitions as number)).toBeGreaterThan(0);
            expect((result.usages as number)).toBeGreaterThan(0);
        });

        it('should track multiple documents', () => {
            handleParse(ctx, VALID_MODEL, 'a.sysml');
            handleParse(ctx, 'package Other { part def Foo; }', 'b.sysml');
            const result = handleGetModelSummary(ctx);
            expect((result.loadedDocuments as string[]).length).toBe(2);
        });
    });

    // -----------------------------------------------------------------------
    // Stateful context behaviour
    // -----------------------------------------------------------------------

    describe('McpContext state', () => {
        it('should persist symbols across parse calls', () => {
            handleParse(ctx, 'package A { part def X; }', 'a.sysml');
            handleParse(ctx, 'package B { part def Y; }', 'b.sysml');

            const all = handleGetSymbols(ctx, {});
            const names = all.symbols.map((s) => s.name);
            expect(names).toContain('X');
            expect(names).toContain('Y');
        });

        it('should replace symbols when re-parsing the same URI', () => {
            handleParse(ctx, 'package A { part def X; }', 'a.sysml');
            handleParse(ctx, 'package A { part def Z; }', 'a.sysml');

            const all = handleGetSymbols(ctx, { uri: 'a.sysml' });
            const names = all.symbols.map((s) => s.name);
            expect(names).toContain('Z');
            expect(names).not.toContain('X');
        });
    });

    // -----------------------------------------------------------------------
    // Resource helpers
    // -----------------------------------------------------------------------

    describe('getElementKinds', () => {
        it('should return categorised element kinds', () => {
            const result = getElementKinds();
            expect(result.definitions.length).toBeGreaterThan(0);
            expect(result.usages.length).toBeGreaterThan(0);
            expect(result.total).toBe(
                result.definitions.length + result.usages.length + result.other.length,
            );
        });

        it('should have definitions ending in "def"', () => {
            const result = getElementKinds();
            result.definitions.forEach((d) => {
                expect(d.endsWith(' def') || d === 'metadata def' || d === 'rendering def').toBe(true);
            });
        });
    });

    describe('SYSML_KEYWORDS', () => {
        it('should contain common keywords', () => {
            expect(SYSML_KEYWORDS).toContain('package');
            expect(SYSML_KEYWORDS).toContain('part');
            expect(SYSML_KEYWORDS).toContain('attribute');
            expect(SYSML_KEYWORDS).toContain('port');
            expect(SYSML_KEYWORDS).toContain('action');
            expect(SYSML_KEYWORDS).toContain('requirement');
        });

        it('should have more than 100 keywords', () => {
            expect(SYSML_KEYWORDS.length).toBeGreaterThan(100);
        });
    });

    // -----------------------------------------------------------------------
    // Format helpers
    // -----------------------------------------------------------------------

    describe('formatSymbol', () => {
        it('should format a symbol with required fields', () => {
            handleParse(ctx, VALID_MODEL, 'test.sysml');
            const sym = ctx.symbolTable.getAllSymbols().find((s) => s.name === 'CameraSystem')!;
            const formatted = formatSymbol(sym);
            expect(formatted.name).toBe('CameraSystem');
            expect(formatted.kind).toBe('part def');
            expect(formatted.qualifiedName).toBe('Camera::CameraSystem');
            expect(formatted.location).toBeDefined();
        });

        it('should omit optional fields when absent', () => {
            handleParse(ctx, 'package P { part def Simple; }', 'test.sysml');
            const sym = ctx.symbolTable.findByName('Simple')[0];
            const formatted = formatSymbol(sym);
            expect(formatted.documentation).toBeUndefined();
            expect(formatted.type).toBeUndefined();
        });
    });

    describe('formatError', () => {
        it('should convert 0-based to 1-based line/column', () => {
            const err = { line: 0, column: 0, message: 'test', length: 1 };
            const formatted = formatError(err);
            expect(formatted.line).toBe(1);
            expect(formatted.column).toBe(1);
            expect(formatted.message).toBe('test');
            expect(formatted.length).toBe(1);
        });
    });
});
