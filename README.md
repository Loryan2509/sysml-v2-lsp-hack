# SysML v2 Language Server

A [Language Server Protocol (LSP)](https://microsoft.github.io/language-server-protocol/) implementation for [SysML v2](https://www.omgsysml.org/SysML-2.htm), powered by the ANTLR4 grammar from [daltskin/sysml-v2-grammar](https://github.com/daltskin/sysml-v2-grammar).

## Features

### Editing & Navigation

| Feature | Shortcut | Description |
|---------|----------|-------------|
| **Diagnostics** | — | Syntax errors, unknown identifiers, keyword typos with red/yellow squiggles |
| **Code Completion** | `Ctrl+Space` | Keywords, snippets, and symbol suggestions with documentation |
| **Signature Help** | auto on `(` | Parameter tooltips when invoking `action def` / `calc def` |
| **Hover** | mouse hover | Element kind, type, qualified name, and documentation |
| **Go to Definition** | `Ctrl+Click` / `F12` | Jump to a symbol's declaration |
| **Find References** | `Shift+F12` | Find all usages of a symbol across the document |
| **Rename Symbol** | `F2` | Rename a symbol and update all references |
| **Linked Editing** | auto | Edit a name and all same-scope occurrences update simultaneously |
| **Document Links** | `Ctrl+Click` | Clickable `import` paths — jump to the imported namespace |

### Code Intelligence

| Feature | Shortcut | Description |
|---------|----------|-------------|
| **CodeLens** | — | "N references" shown above each definition, clickable |
| **Inlay Hints** | — | Ghost text showing inferred types (`: Type`) and supertypes (`:> Super`) |
| **Type Hierarchy** | `Shift+Alt+H` | Navigate specialization chains — supertypes and subtypes |
| **Call Hierarchy** | `Shift+Alt+H` | Navigate `perform`/`include` chains between actions |
| **Workspace Symbols** | `Ctrl+T` | Fuzzy search for any definition across all open files |

### Presentation

| Feature | Shortcut | Description |
|---------|----------|-------------|
| **Semantic Tokens** | — | Rich, context-aware syntax highlighting (definitions, usages, keywords, types) |
| **Document Symbols** | `Ctrl+Shift+O` | Outline panel + breadcrumbs showing SysML model structure |
| **Folding Ranges** | — | Collapsible `{ }` blocks and comment regions |
| **Selection Ranges** | `Shift+Alt+Right/Left` | Smart expand/shrink selection (word → line → block → enclosing block) |

### Productivity

| Feature | Shortcut | Description |
|---------|----------|-------------|
| **Quick Fix** | `Ctrl+.` | Fix keyword typos (e.g., `paart` → `part`) |
| **Formatting** | `Shift+Alt+F` | Auto-indent, normalize braces, trim trailing whitespace |
| **Snippets** | type prefix + `Tab` | 30 SysML snippets — `partdef`, `actiondef`, `reqdef`, `statedef`, etc. |

## Quick Start

### Dev Container (recommended)

Open in GitHub Codespaces or VS Code Dev Containers — everything is pre-installed.

### Manual Setup

```bash
# Install dependencies
npm install

# Generate TypeScript parser from ANTLR4 grammar
npm run generate

# Build
npm run build

# Run tests
npm test
```

### Development

```bash
# Watch mode — recompiles on file changes
npm run watch

# Then press F5 in VS Code to launch the extension + server
```

Use the **"Client + Server"** compound debug configuration to debug both sides simultaneously.

## Architecture

```
┌──────────────────────┐     IPC     ┌──────────────────────────┐
│   VS Code Extension  │ ◄─────────► │      Language Server          │
│   (Language Client)   │             │      (Separate Process)       │
├──────────────────────┤             ├──────────────────────────────┤
│ • Starts server       │             │ • ANTLR4 parser (worker thread)│
│ • Registers language  │             │ • Diagnostics + keyword typos │
│                       │             │ • Completions / signature help│
│                       │             │ • Hover / go-to-def / refs    │
│                       │             │ • Semantic tokens / CodeLens  │
│                       │             │ • Rename / linked editing     │
│                       │             │ • Inlay hints / document links│
│                       │             │ • Type & call hierarchy       │
│                       │             │ • Formatting / folding / sel. │
│                       │             │ • Workspace symbols           │
└──────────────────────┘             └──────────────────────────┘

┌──────────────────────┐   stdio    ┌──────────────────────────┐
│   AI Assistant       │ ◄─────────► │      MCP Server              │
│   (Claude, Copilot)  │             │      (Standalone Process)     │
├──────────────────────┤             ├──────────────────────────────┤
│ • Sends tool calls   │             │ • Parse / validate SysML      │
│ • Reads resources    │             │ • Symbol table queries         │
│ • Uses prompts       │             │ • Hierarchy / references       │
│                       │             │ • Grammar reference resources  │
│                       │             │ • Review / generate prompts    │
└──────────────────────┘             └──────────────────────────┘
```

### Project Structure

```
sysml-v2-lsp/
├── client/                 # VS Code Language Client extension
│   └── src/extension.ts    # Starts LanguageClient, connects to server
├── server/                 # Language Server (runs in separate process)
│   └── src/
│       ├── server.ts       # LSP connection, capability registration
│       ├── mcpServer.ts    # MCP server (standalone, stdio transport)
│       ├── documentManager.ts  # Parse cache, document lifecycle
│       ├── parser/         # ANTLR4 parse pipeline
│       ├── symbols/        # Symbol table, scopes, element types
│       └── providers/      # LSP feature implementations
├── grammar/                # ANTLR4 grammar files (.g4)
├── test/                   # Unit tests (vitest) + E2E tests
└── package.json            # Extension manifest + monorepo scripts
```

## Grammar Updates

The grammar files in `grammar/` are sourced from [daltskin/sysml-v2-grammar](https://github.com/daltskin/sysml-v2-grammar). To pull the latest version:

```bash
npm run update-grammar
npm run generate
```

## Available Commands

```bash
make install          # Install all dependencies
make generate         # Generate TypeScript parser from grammar
make build            # Compile + bundle
make watch            # Watch mode
make test             # Run unit tests
make lint             # ESLint
make package          # Build .vsix
make update-grammar   # Pull latest grammar from upstream
make ci               # Full CI pipeline
```

## MCP Server (AI Integration)

The project includes a [Model Context Protocol](https://modelcontextprotocol.io/) server that lets AI assistants parse, validate, and query SysML v2 models.

### VS Code

The workspace includes `.vscode/mcp.json` — the MCP server is automatically available to GitHub Copilot. Build first:

```bash
npm run build
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sysml-v2": {
      "command": "node",
      "args": ["/path/to/sysml-v2-lsp/dist/server/mcpServer.mjs"]
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `parse` | Parse SysML source, build symbol table, return summary |
| `validate` | Check syntax and return errors |
| `getSymbols` | List symbols (filter by kind, URI, definitions/usages) |
| `getDefinition` | Look up a symbol by name or qualified name |
| `getReferences` | Find all references to a symbol |
| `getHierarchy` | Get parent–child containment structure |
| `getModelSummary` | Counts, kinds, and loaded documents |

### Available Resources

| URI | Description |
|-----|-------------|
| `sysml://element-kinds` | All recognised element kinds |
| `sysml://keywords` | Complete keyword list |
| `sysml://grammar-overview` | Language structure reference |

### Available Prompts

| Prompt | Description |
|--------|-------------|
| `review-sysml` | Review a SysML model for correctness |
| `explain-element` | Explain a SysML element kind |
| `generate-sysml` | Generate SysML from a description |

### Quick Test Examples

Once the MCP server is running (green dot in **MCP: List Servers**), try these prompts in Copilot Chat:

**Parse a model:**
> `@sysml-v2` parse this: `package Demo { part def Vehicle { attribute speed : Real; } part car : Vehicle; }`

**Validate with errors:**
> `@sysml-v2` validate this: `part def Broken { attribute x :`

**List symbols after parsing:**
> `@sysml-v2` what symbols are in the model?

**Look up a definition:**
> `@sysml-v2` find the definition of Vehicle

**Get the hierarchy:**
> `@sysml-v2` show the hierarchy of car

**Get a model summary:**
> `@sysml-v2` summarise the loaded model

> **Tip:** Click the **tools icon** (wrench) at the bottom of the Chat input to see all available `sysml-v2` tools.

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (strict mode) |
| Runtime | Node.js ≥ 18 |
| Parser | ANTLR4 via [antlr4ng](https://github.com/mike-lischke/antlr4ng) |
| Generator | [antlr-ng](https://github.com/nicklockwood/antlr-ng) |
| LSP | [vscode-languageserver](https://github.com/microsoft/vscode-languageserver-node) |
| MCP | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) |
| Bundler | esbuild |
| Tests | vitest |

## Related Projects

- [daltskin/sysml-v2-grammar](https://github.com/daltskin/sysml-v2-grammar) — ANTLR4 grammar for SysML v2
- [daltskin/VSCode_SysML_Extension](https://github.com/daltskin/VSCode_SysML_Extension) — VS Code extension with visualization
- [OMG SysML v2 Specification](https://github.com/Systems-Modeling/SysML-v2-Release)

## License

MIT
