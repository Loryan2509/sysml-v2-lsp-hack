/**
 * SysML v2 MCP Server
 *
 * A Model Context Protocol server that exposes SysML v2 parsing and analysis
 * capabilities as tools, resources, and prompts for AI assistants.
 *
 * Run via stdio transport:
 *   node dist/server/mcpServer.mjs
 *
 * Or use in an MCP configuration (Claude Desktop, VS Code, etc.):
 *   { "command": "node", "args": ["path/to/dist/server/mcpServer.mjs"] }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { isDefinition, isUsage } from './symbols/sysmlElements.js';
import {
    McpContext,
    parseAndBuild,
    handleParse,
    handleValidate,
    handleGetSymbols,
    handleGetDefinition,
    handleGetReferences,
    handleGetHierarchy,
    handleGetModelSummary,
    getElementKinds,
    SYSML_KEYWORDS,
} from './mcpCore.js';

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer(
    { name: 'sysml-v2', version: '0.1.0' },
    { capabilities: { logging: {} } },
);

const ctx = new McpContext();

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.registerTool(
    'parse',
    {
        title: 'Parse SysML Document',
        description:
            'Parse a SysML v2 document and build a symbol table. ' +
            'Returns syntax errors (if any) and a summary of discovered symbols. ' +
            'The parsed model is retained for subsequent queries (getSymbols, getDefinition, etc.).',
        inputSchema: {
            code: z.string().describe('The SysML v2 source code to parse'),
            uri: z.string().optional().describe('A URI/name to identify this document (defaults to "untitled.sysml")'),
        },
    },
    async ({ code, uri }) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(handleParse(ctx, code, uri), null, 2) }],
    }),
);

server.registerTool(
    'validate',
    {
        title: 'Validate SysML Document',
        description:
            'Validate a SysML v2 document and return all syntax errors. ' +
            'Returns an empty errors array if the document is syntactically valid.',
        inputSchema: {
            code: z.string().describe('The SysML v2 source code to validate'),
            uri: z.string().optional().describe('A URI/name to identify this document'),
        },
    },
    async ({ code, uri }) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(handleValidate(ctx, code, uri), null, 2) }],
    }),
);

server.registerTool(
    'getSymbols',
    {
        title: 'Get SysML Symbols',
        description:
            'List all symbols from the most recently parsed document(s). ' +
            'Optionally filter by element kind (e.g., "part def", "action") or document URI.',
        inputSchema: {
            kind: z.string().optional().describe('Filter by SysML element kind (e.g., "part def", "port", "action def")'),
            uri: z.string().optional().describe('Filter by document URI. If omitted, returns symbols from all loaded documents.'),
            definitionsOnly: z.boolean().optional().describe('If true, return only definition elements (types)'),
            usagesOnly: z.boolean().optional().describe('If true, return only usage elements (instances)'),
        },
    },
    async (args) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(handleGetSymbols(ctx, args), null, 2) }],
    }),
);

server.registerTool(
    'getDefinition',
    {
        title: 'Get Symbol Definition',
        description:
            'Find the definition of a SysML element by name or qualified name. ' +
            'Returns matching symbols with their location and type information.',
        inputSchema: {
            name: z.string().describe('The symbol name to look up (simple name or qualified name like "Package::Element")'),
        },
    },
    async ({ name }) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(handleGetDefinition(ctx, name), null, 2) }],
    }),
);

server.registerTool(
    'getReferences',
    {
        title: 'Find References',
        description: 'Find all references to a symbol by name across all loaded documents.',
        inputSchema: {
            name: z.string().describe('The symbol name to find references for'),
        },
    },
    async ({ name }) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(handleGetReferences(ctx, name), null, 2) }],
    }),
);

server.registerTool(
    'getHierarchy',
    {
        title: 'Get Element Hierarchy',
        description:
            'Get the parent–child hierarchy of a SysML element, showing its ' +
            'containment structure (package → definition → usage).',
        inputSchema: {
            name: z.string().describe('The qualified name or simple name of the element to inspect'),
        },
    },
    async ({ name }) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(handleGetHierarchy(ctx, name), null, 2) }],
    }),
);

server.registerTool(
    'getModelSummary',
    {
        title: 'Get Model Summary',
        description:
            'Return a high-level summary of the currently loaded SysML model(s), ' +
            'including element counts by kind and a list of loaded documents.',
        inputSchema: {},
    },
    async () => ({
        content: [{ type: 'text' as const, text: JSON.stringify(handleGetModelSummary(ctx), null, 2) }],
    }),
);

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

server.registerResource(
    'sysml-element-kinds',
    'sysml://element-kinds',
    {
        title: 'SysML v2 Element Kinds',
        description: 'Reference of all SysML v2 element kinds recognised by the parser, grouped into definitions and usages.',
        mimeType: 'application/json',
    },
    async (uri) => ({
        contents: [{ uri: uri.href, text: JSON.stringify(getElementKinds(), null, 2) }],
    }),
);

server.registerResource(
    'sysml-keywords',
    'sysml://keywords',
    {
        title: 'SysML v2 Keywords',
        description: 'Complete list of SysML v2 language keywords, useful for syntax reference.',
        mimeType: 'application/json',
    },
    async (uri) => ({
        contents: [{ uri: uri.href, text: JSON.stringify({ keywords: SYSML_KEYWORDS, count: SYSML_KEYWORDS.length }, null, 2) }],
    }),
);

server.registerResource(
    'sysml-grammar-overview',
    'sysml://grammar-overview',
    {
        title: 'SysML v2 Grammar Overview',
        description: 'A concise overview of the SysML v2 language structure: element categories, specialisation syntax, and common patterns.',
        mimeType: 'text/markdown',
    },
    async (uri) => ({
        contents: [{
            uri: uri.href,
            text: `# SysML v2 Grammar Overview

## Element Categories

### Definitions (Types)
Definitions declare reusable types:
- \`part def\` — structural element type
- \`attribute def\` — value type
- \`port def\` — interface point type
- \`connection def\` — connection type
- \`interface def\` — interface type
- \`action def\` — behavior type
- \`state def\` — state machine type
- \`requirement def\` — requirement type
- \`constraint def\` — constraint type
- \`item def\` — general item type
- \`enum def\` — enumeration type
- \`calc def\` — calculation type
- \`use case def\` — use case type
- \`allocation def\` — allocation type
- \`view def\` / \`viewpoint def\` — viewpoint types

### Usages (Instances)
Usages create instances of definitions:
- \`part\` — structural instance
- \`attribute\` — value instance
- \`port\` — port instance
- \`action\` — action step
- \`state\` — state instance
- \`requirement\` — requirement instance
- \`item\` — item instance

## Specialisation Syntax
- \`part car : Vehicle\` — \`car\` specialises \`Vehicle\`
- \`part car :> baseVehicle\` — \`car\` subsets \`baseVehicle\`
- \`part car :>> specificVehicle\` — \`car\` redefines \`specificVehicle\`

## Packages & Namespaces
\`\`\`sysml
package VehicleModel {
    part def Vehicle { ... }
    part car : Vehicle;
}
\`\`\`

## Documentation
\`\`\`sysml
part def Vehicle {
    doc /* A general vehicle definition */
    attribute mass : Real;
}
\`\`\`

## Unrestricted Names
Names with spaces use single quotes: \`part 'Main Assembly' : Assembly;\`
`,
        }],
    }),
);

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

server.registerPrompt(
    'review-sysml',
    {
        title: 'Review SysML Model',
        description: 'Analyse a SysML v2 model for correctness, best practices, and potential improvements.',
        argsSchema: { code: z.string().describe('The SysML v2 source code to review') },
    },
    async ({ code }) => {
        const { errors, symbolCount } = parseAndBuild(ctx, code, 'review.sysml');
        const allSymbols = ctx.symbolTable.getSymbolsForUri('review.sysml');
        const defs = allSymbols.filter((s) => isDefinition(s.kind));
        const usages = allSymbols.filter((s) => isUsage(s.kind));

        const context = [
            `Parsed: ${symbolCount} symbols, ${errors.length} syntax errors`,
            `Definitions: ${defs.map((d) => `${d.kind} ${d.name}`).join(', ') || 'none'}`,
            `Usages: ${usages.map((u) => `${u.kind} ${u.name}`).join(', ') || 'none'}`,
        ];
        if (errors.length > 0) {
            context.push(`Errors: ${errors.map((e) => `line ${e.line + 1}: ${e.message}`).join('; ')}`);
        }

        return {
            messages: [{
                role: 'user' as const,
                content: {
                    type: 'text' as const,
                    text: `Please review the following SysML v2 model for correctness, completeness, and best practices.

## Parse Results
${context.join('\n')}

## Source Code
\`\`\`sysml
${code}
\`\`\`

Please check for:
1. Syntax errors and how to fix them
2. Missing type specialisations
3. Naming conventions (PascalCase for definitions, camelCase for usages)
4. Missing documentation (doc comments)
5. Structural completeness (are there orphaned usages without definitions?)
6. Suggestions for additional ports, attributes, or constraints`,
                },
            }],
        };
    },
);

server.registerPrompt(
    'explain-element',
    {
        title: 'Explain SysML Element',
        description: 'Explain what a specific SysML v2 element kind is and how it is used.',
        argsSchema: {
            element: z.string().describe('The SysML element kind to explain (e.g., "part def", "action", "port def", "requirement")'),
        },
    },
    async ({ element }) => ({
        messages: [{
            role: 'user' as const,
            content: {
                type: 'text' as const,
                text: `Explain the SysML v2 element kind "${element}" in detail. Include:

1. What it represents in systems engineering
2. The difference between its definition form and usage form (if applicable)
3. Common attributes and relationships
4. A simple SysML v2 code example
5. When to use it vs similar elements

Use the SysML v2 syntax (not SysML v1 block diagrams).`,
            },
        }],
    }),
);

server.registerPrompt(
    'generate-sysml',
    {
        title: 'Generate SysML Model',
        description: 'Generate a SysML v2 model from a natural language description of a system.',
        argsSchema: {
            description: z.string().describe('A natural language description of the system to model'),
            scope: z.string().optional().describe('Desired scope/focus (e.g., "structural only", "with requirements", "full behavioral")'),
        },
    },
    async ({ description, scope }) => {
        const scopeHint = scope
            ? `Focus on: ${scope}`
            : 'Include structural definitions, key attributes, ports, and connections.';

        return {
            messages: [{
                role: 'user' as const,
                content: {
                    type: 'text' as const,
                    text: `Generate a SysML v2 model for the following system description.

## System Description
${description}

## Scope
${scopeHint}

## Requirements
- Use valid SysML v2 syntax
- Organise elements in packages
- Use PascalCase for definitions, camelCase for usages
- Add doc comments for key elements
- Include type specialisations where appropriate
- Use ports and connections for interfaces between parts

Return the complete SysML v2 source code in a single code block.`,
                },
            }],
        };
    },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    console.error('MCP server failed to start:', err);
    process.exit(1);
});
