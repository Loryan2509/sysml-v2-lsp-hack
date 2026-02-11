# SysML v2 Language Server

A [Language Server Protocol (LSP)](https://microsoft.github.io/language-server-protocol/) implementation for [SysML v2](https://www.omgsysml.org/SysML-2.htm), powered by the ANTLR4 grammar from [daltskin/sysml-v2-grammar](https://github.com/daltskin/sysml-v2-grammar).

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| **Diagnostics** | ✅ | Syntax error reporting with red squiggles |
| **Document Symbols** | ✅ | Outline panel with SysML model structure |
| **Hover** | ✅ | Element kind, type, and documentation on hover |
| **Go to Definition** | ✅ | Ctrl+Click navigation to declarations |
| **Find References** | ✅ | Find all usages of a symbol |
| **Code Completion** | ✅ | Keywords, snippets, and symbol suggestions |
| **Semantic Tokens** | ✅ | Rich, context-aware syntax highlighting |
| **Folding Ranges** | ✅ | Collapsible `{ }` blocks and comments |
| **Rename** | ✅ | Rename symbol and all references |

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
│   VS Code Extension  │ ◄─────────► │    Language Server        │
│   (Language Client)   │             │    (Separate Process)     │
├──────────────────────┤             ├──────────────────────────┤
│ • Starts server       │             │ • ANTLR4 parser           │
│ • Registers language  │             │ • Diagnostics             │
│                       │             │ • Completion (keywords)   │
│                       │             │ • Symbols / hover         │
│                       │             │ • Go-to-def / references  │
│                       │             │ • Semantic tokens         │
│                       │             │ • Rename / folding        │
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

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (strict mode) |
| Runtime | Node.js ≥ 18 |
| Parser | ANTLR4 via [antlr4ng](https://github.com/mike-lischke/antlr4ng) |
| Generator | [antlr-ng](https://github.com/nicklockwood/antlr-ng) |
| LSP | [vscode-languageserver](https://github.com/microsoft/vscode-languageserver-node) |
| Bundler | esbuild |
| Tests | vitest |

## Related Projects

- [daltskin/sysml-v2-grammar](https://github.com/daltskin/sysml-v2-grammar) — ANTLR4 grammar for SysML v2
- [daltskin/VSCode_SysML_Extension](https://github.com/daltskin/VSCode_SysML_Extension) — VS Code extension with visualization
- [OMG SysML v2 Specification](https://github.com/Systems-Modeling/SysML-v2-Release)

## License

MIT
