/**
 * SysML v2 MCP Server
 *
 * A Model Context Protocol server that exposes SysML v2 parsing and analysis
 * capabilities as tools, resources, and prompts for AI assistants.
 *
 * Run via stdio transport:
 *   node dist/server/mcpServer.js
 *
 * Or use in an MCP configuration (Claude Desktop, VS Code, etc.):
 *   { "command": "node", "args": ["path/to/dist/server/mcpServer.js"] }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
    McpContext,
    handleGetComplexity,
    handleGetDefinition,
    handleGetDiagnostics,
    handleGetHierarchy,
    handleGetModelSummary,
    handleGetReferences,
    handleGetSymbols,
    handleParse,
    handlePreview,
    handlePromptExplainElement,
    handlePromptGenerateSysml,
    handlePromptReviewSysml,
    handleResourceElementKinds,
    handleResourceGrammarOverview,
    handleResourceKeywords,
    handleValidate,
} from './mcpCore.js';

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer(
    { name: 'sysml-v2', version: '0.1.4' },
    {
        capabilities: { logging: {} },
        instructions:
            'SysML v2 Model Context server. CRITICAL RULES:\n' +
            '1. Call EXACTLY the tool(s) the user asked for — nothing more. Never add extra tool calls.\n' +
            '2. "preview" means ONLY the preview tool. NEVER call getComplexity alongside preview.\n' +
            '3. getComplexity may ONLY be called when the user literally asks for "complexity" or "metrics".\n' +
            '4. AFTER calling the preview tool, you MUST IMMEDIATELY call the "renderMermaidDiagram" tool.\n' +
            '   Pass the "mermaidMarkup" field from the preview response as the "markup" parameter.\n' +
            '   Pass the "title" field as the "title" parameter.\n' +
            '   Do NOT paste mermaid markup as text — it will not render visually.\n' +
            '   The renderMermaidDiagram tool is the ONLY way to display diagrams to the user.\n' +
            '5. After rendering the diagram, reply with ONLY a brief one-sentence summary.\n' +
            '   NEVER show raw JSON, mermaid markup, element counts, participant counts, or semantic notes.',
    },
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
            'Parse and validate a SysML v2 document. Returns both syntax errors and ' +
            'semantic issues (unresolved types, invalid multiplicity, empty enums, ' +
            'duplicate definitions, unused definitions, naming conventions, missing docs).',
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
    'getDiagnostics',
    {
        title: 'Get Model Diagnostics',
        description:
            'Return semantic diagnostics for a previously parsed document: unresolved types, ' +
            'invalid multiplicity, empty enums, duplicate definitions, unused definitions, ' +
            'naming convention violations, and missing documentation. ' +
            'Parse the document first with the "parse" or "validate" tool.',
        inputSchema: {
            uri: z.string().optional().describe('The URI of the document to diagnose (defaults to "untitled.sysml")'),
        },
    },
    async ({ uri }) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(handleGetDiagnostics(ctx, uri), null, 2) }],
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

server.registerTool(
    'getComplexity',
    {
        title: 'Get Model Complexity',
        description:
            'IMPORTANT: Do NOT call this tool unless the user\'s message contains the word ' +
            '"complexity" or "metrics". Never call alongside preview or other tools. ' +
            'Analyse the structural complexity of the loaded SysML model(s). ' +
            'Returns a Model Complexity Index (0–100), per-definition hotspots, ' +
            'coupling count, documentation coverage, and other metrics. ' +
            'Optionally scope the analysis to a single document URI.',
        annotations: {
            title: 'Get Model Complexity',
            readOnlyHint: true,
            openWorldHint: false,
        },
        inputSchema: {
            uri: z.string().optional().describe('Optional document URI to scope the analysis to a single file'),
        },
    },
    async ({ uri }) => ({
        content: [{ type: 'text' as const, text: JSON.stringify(handleGetComplexity(ctx, uri), null, 2) }],
    }),
);

server.registerTool(
    'preview',
    {
        title: 'Preview SysML Diagram',
        description:
            'Parse SysML v2 code and generate a Mermaid diagram. ' +
            'Supports General, Activity, State, Sequence, Use Case, and Interconnection views — ' +
            'the best type is auto-detected from the code, or you can specify one. ' +
            'Optionally provide original code to see a diff of what changed.\n\n' +
            'RENDERING: The response includes a `mermaidMarkup` field containing valid Mermaid syntax. ' +
            'After receiving the response, you MUST call the `renderMermaidDiagram` tool, passing ' +
            'the mermaidMarkup value as the `markup` parameter and the title as the `title` parameter. ' +
            'This is the ONLY way to show the diagram visually to the user.',
        inputSchema: {
            code: z.string().describe(
                'The SysML v2 source code to preview. Can be a complete model or a snippet.',
            ),
            originalCode: z.string().optional().describe(
                'Optional original SysML code to compare against. When provided, the response ' +
                'includes a diff summary showing added, changed, and removed elements.',
            ),
            diagramType: z.enum(['general', 'activity', 'state', 'sequence', 'interconnection', 'usecase']).optional().describe(
                'Force a specific diagram type. If omitted, the best type is auto-detected ' +
                'from the element kinds in the code (e.g., actions → activity, use cases → usecase diagram).',
            ),
            focus: z.string().optional().describe(
                'Focus the diagram on a specific element by name. Only the element, its children, ' +
                'parent, and related types will be rendered — useful for large models.',
            ),
            uri: z.string().optional().describe(
                'A URI/name for the document (defaults to "preview.sysml")',
            ),
        },
    },
    async ({ code, originalCode, diagramType, focus, uri }) => {
        const result = handlePreview(ctx, { code, originalCode, diagramType, focus, uri });

        // Build a minimal data payload containing ONLY what renderMermaidDiagram
        // needs (mermaidMarkup + title).  Extra metadata like elementCount,
        // diagramType, semanticIssues are kept out so the model does not echo
        // them verbatim to the user.
        const renderData: Record<string, unknown> = {
            mermaidMarkup: result.diagram,
            title: result.description,
        };

        // Diff summaries are useful context when the user asked for a what-if
        // comparison, so include them only when present.
        if (result.diff) {
            renderData.diff = result.diff;
        }

        // Syntax errors are critical — the user needs to know about them.
        if (result.errors.length > 0) {
            renderData.syntaxErrors = result.errors;
        }

        // Return TWO content blocks:
        // 1. Strict behavioural instructions for the model
        // 2. Minimal data needed for renderMermaidDiagram
        return {
            content: [
                {
                    type: 'text' as const,
                    text: 'ACTION REQUIRED: You MUST now call the "renderMermaidDiagram" tool to display this diagram.\n' +
                        'Pass the "mermaidMarkup" field from the data below as the "markup" parameter and the "title" field as the "title" parameter.\n\n' +
                        'AFTER the diagram renders, respond with ONLY a single brief sentence such as ' +
                        '"Here is your <diagramType> diagram." and nothing else.\n' +
                        'Do NOT show or describe: mermaid markup, JSON data, element counts, participant counts, ' +
                        'interaction counts, semantic notes, or any raw tool output.\n' +
                        'If there are syntaxErrors in the data, mention them briefly. Otherwise output NOTHING extra.',
                },
                {
                    type: 'text' as const,
                    text: JSON.stringify(renderData, null, 2),
                },
            ],
        };
    },
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
        contents: [{ uri: uri.href, text: JSON.stringify(handleResourceElementKinds(), null, 2) }],
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
        contents: [{ uri: uri.href, text: JSON.stringify(handleResourceKeywords(), null, 2) }],
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
        contents: [{ uri: uri.href, text: handleResourceGrammarOverview() }],
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
    async ({ code }) => ({
        messages: handlePromptReviewSysml(ctx, code),
    }),
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
        messages: handlePromptExplainElement(element),
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
    async ({ description, scope }) => ({
        messages: handlePromptGenerateSysml(description, scope),
    }),
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
