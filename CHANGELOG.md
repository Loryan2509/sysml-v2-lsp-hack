# Changelog

## [0.3.0]

### Added

- Mermaid diagram preview: SysML → Mermaid diagram generation with 6 diagram types (class, activity, state, sequence, interconnection, use-case) and auto-detection
- Mermaid focus mode: filter diagram to a specific element, its children, parent, and related types
- Mermaid diff mode: compare original vs. modified SysML and report structural changes
- Complexity analyzer: structural complexity metrics (nesting depth, coupling, fan-out, documentation coverage) with composite 0–100 index and per-definition hotspots
- Semantic validator: unresolved type references, invalid multiplicity bounds, empty enumerations, duplicate definitions — with standard-library type allow-list
- MCP tool `preview`: generates Mermaid diagrams from SysML with focus/diff support
- MCP tool `getDiagnostics`: returns semantic diagnostics for parsed documents
- MCP tool `getComplexity`: exposes complexity analysis as an MCP tool
- Code action quick-fixes: naming convention (PascalCase/camelCase), missing documentation stub, empty enumeration placeholder, unused definition suppression
- Library type-level indexing: Go-to-Definition into standard library types at exact declaration lines
- Multiplicity extraction from parse tree (`0..*`, `1`, etc.) on symbols
- Documentation extraction from doc/comment nodes on symbols
- Symbol table caching per URI keyed by document version
- Multi-specialization support: comma-separated specialization targets with `:>` and `specializes`
- New tests: codeActions, complexity, libraryIndex, semantic validation, MCP preview/diagnostics

### Changed

- MCP `validate` response shape: now returns `syntaxErrors`, `semanticIssues`, and `totalIssues` (was `errors` + `errorCount`)
- Symbol `typeName` → `typeNames` (array) across MCP core and model provider
- Definition provider simplified: word-at-position logic moved inline
- References provider: uses symbol-table–based `findReferences()` instead of cross-file text scanning
- Diagnostics computed synchronously on document change (removed background parse worker thread)
- Symbol table kind inference: direct string comparison replaces regex-based rule matching for minification safety
- Document manager simplified: removed `TextDocuments` integration and parse timing tracking
- esbuild: simplified to single server bundle (removed worker and separate MCP server entries)

### Removed

- Background parse worker thread (`parseWorker.mjs`) and DFA warm-up
- `resolveAt()` and `getWordAtPosition()` from symbol table (moved to providers)
- `findTextReferences()` text-scanning reference finder
- Keyword typo validation from diagnostics provider (replaced by semantic validator)

## [0.2.0]

### Added

- Custom LSP request (`sysml/model`): full semantic model with scoped queries
- MCP server (`sysml-mcp` CLI): 7 tools, 3 resources, 3 prompts for AI-assisted modelling
- Standard library: 94 bundled SysML v2 / KerML files from OMG release repo
- Inlay hints: ghost text for inferred types and supertypes
- Call hierarchy: action call graph navigation
- Type hierarchy: specialization chain navigation
- Signature help: parameter tooltips for action/calc invocations
- Code lens: reference counts above definitions
- Document links: clickable `import` statements
- Workspace symbols: cross-document symbol search
- Linked editing ranges: simultaneous rename of all occurrences
- Selection ranges: smart expand/shrink selection
- Code actions: quick-fix actions for diagnostics
- Formatting: document and range formatting
- Keyword validation: typo detection with "did you mean?" suggestions
- npm package: `sysml-v2-lsp` distributable for third-party extensions
- Python LSP client: reference JSON-RPC/stdio client
- Parse worker: background ANTLR parsing with DFA warm-up
- `make update-library`: fetch latest standard library from upstream
- `make package-server` / `make test-package`: npm tarball build and validation

### Changed

- Go-to-definition falls back to standard library for unresolved symbols
- Recursive type name extraction in symbol table
- Synthetic `start`/`done` nodes in activity diagram flows
- Element kind enum expanded to 55 kinds
- esbuild bundles four targets: server, worker, MCP server, VS Code client

## [0.1.0]

### Added

- Initial LSP server with ANTLR4-based SysML v2 parser
- Diagnostics: syntax error reporting
- Document symbols: outline panel integration
- Hover: element kind, type, and documentation
- Go to definition: navigate to declarations
- Find references: locate all usages
- Code completion: keywords, snippets, symbol suggestions
- Semantic tokens: rich syntax highlighting
- Folding ranges: collapsible blocks and comments
- Rename: symbol rename with reference updates
- VS Code Language Client extension
- vitest unit tests
- GitHub Actions CI/CD
- Dev Container support
