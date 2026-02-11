# Contributing

## Prerequisites

- Node.js ≥ 18
- npm

## Setup

```bash
git clone https://github.com/daltskin/sysml-v2-lsp.git
cd sysml-v2-lsp
npm install
npm run generate
npm run build
```

## Development Workflow

1. Run `npm run watch` in a terminal for continuous TypeScript compilation
2. Press **F5** in VS Code to launch the Extension Development Host
3. Open a `.sysml` file to test the language server

Use the **"Client + Server"** compound launch configuration to debug both the client and server simultaneously.

## Making Changes

### Parser Changes

If you modify the ANTLR grammar (rare — usually done upstream in `sysml-v2-grammar`):

```bash
npm run generate   # Regenerate TypeScript parser from .g4
npm run build      # Recompile
npm test           # Verify
```

### Provider Changes

Each LSP feature lives in `server/src/providers/`. Add new providers by:

1. Creating a new provider class in `server/src/providers/`
2. Registering it in `server/src/server.ts`
3. Adding tests in `test/unit/`

### Testing

```bash
npm test           # Run all unit tests
npm run test:watch # Watch mode
```

## Pull Request Guidelines

- Include tests for new features
- Run `npm run lint` and `npm test` before submitting
- Keep commits focused and well-described
