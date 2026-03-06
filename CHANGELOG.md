# Changelog

## [0.6.0]

### Added

- Shared utilities: `identUtils.ts` for identifier handling, `symbolKindMapping.ts` for LSP SymbolKind mapping
- Keywords now derived from ANTLR grammar at runtime — no manual list to maintain
- Grammar support for `end` keyword syntax in interface/connection definitions
- DFA snapshot infrastructure for parser serialisation

### Changed

- Code actions use structured diagnostic data instead of message parsing
- Semantic tokens provider integrates lexer token types for operators/punctuation
- Library indexing supports qualified name resolution
- Parser retries with cleared DFA on error
- Refactored providers to use shared utility modules

### Removed

- Hand-maintained keyword list (replaced by grammar-derived extraction)

## [0.5.1]

### Changed

- Semantic validator: library type and feature reference checks
- Symbol table: improved keyword and redefinition pattern handling

## [0.5.0]

### Changed

- Symbol table uses `ruleIndex` instead of `constructor.name` for minification safety
- Removed committed dist/ build artefacts from repository

## [0.4.1]

### Fixed

- Web client graceful shutdown
- Release pipeline fix

## [0.4.0]

### Added

- Web client: browser-based SysML editor (`clients/web/`)
- Python LSP client: Jupyter notebook demo

### Changed

- Library index, MCP server, and symbol table improvements

## [0.3.1]

### Fixed

- esbuild: added `keepNames` for debugging
- Removed committed dist/ build artefacts

## [0.3.0]

### Added

- Mermaid diagram preview with 6 diagram types, focus mode, and diff mode
- Complexity analyser: structural metrics with composite 0–100 index
- Semantic validator: unresolved types, invalid multiplicity, duplicate definitions
- MCP tools: `preview`, `getDiagnostics`, `getComplexity`
- Code action quick-fixes: naming conventions, doc stubs, empty enum placeholders
- Library type-level indexing with Go-to-Definition into standard library
- Multiplicity and documentation extraction from parse tree
- LSP `sysml/serverStats`, `sysml/clearCache`, `sysml/status` requests

### Changed

- MCP `validate` response: `syntaxErrors` + `semanticIssues` (was `errors` + `errorCount`)
- Symbol `typeName` → `typeNames` (array)
- Diagnostics computed synchronously (removed background worker)
- Parser simplified to single-pass (removed SLL/LL fallback)
- esbuild output changed from ESM to CJS

### Removed

- Background parse worker thread and DFA warm-up
- Text-scanning reference finder (replaced by symbol-table lookups)

## [0.2.0]

### Added

- Custom LSP request `sysml/model` for full semantic model with scoped queries
- MCP server (`sysml-mcp` CLI): 7 tools, 3 resources, 3 prompts
- Standard library: 94 bundled SysML v2 / KerML files
- LSP providers: inlay hints, call/type hierarchy, signature help, code lens, document links, workspace symbols, linked editing, selection ranges, code actions, formatting
- Keyword validation with "did you mean?" suggestions
- npm package, Python LSP client, background parse worker
- `make update-library`, `make package-server`, `make test-package`

### Changed

- Go-to-definition falls back to standard library
- Element kind enum expanded to 55 kinds

## [0.1.7]

### Changed

- Keyword validator: expanded SysML element coverage
- New parser, symbol table, and provider tests

## [0.1.6]

### Fixed

- Keyword validation diagnostic messages
- Python LSP client diagnostics handling

## [0.1.5]

### Added

- Inlay hints, call hierarchy improvements
- Python LSP client with README
- Client restructured under `clients/vscode/`

## [0.1.4]

### Added

- MCP core module extracted from MCP server
- Constraint parsing tests, grammar refinements

## [0.1.3]

### Fixed

- `constructor.name` minification breaking code lens
- ESM bundles renamed to `.mjs` for Node 20 compatibility
- Bundled deps moved to devDependencies (zero runtime deps)

## [0.1.2]

### Fixed

- Removed unused `antlr4-c3` dependency

## [0.1.1]

### Fixed

- Dropped Node 18 from CI (Vite 7 requires Node 20+)
- Release pipeline and trusted publishing fixes

## [0.1.0]

### Added

- Initial LSP server with ANTLR4-based SysML v2 parser
- LSP providers: diagnostics, document symbols, hover, go-to-definition, find references, completion, semantic tokens, folding, rename
- VS Code Language Client extension
- vitest unit tests, GitHub Actions CI/CD, Dev Container
