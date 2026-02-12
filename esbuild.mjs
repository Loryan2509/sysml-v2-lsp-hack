import * as esbuild from 'esbuild';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const baseConfig = {
    bundle: true,
    minify: isProduction,
    sourcemap: !isProduction,
    platform: 'node',
    target: 'node18',
    logLevel: 'info',
};

// Bundle the server (ESM — server/package.json has "type": "module")
// Output to dist/ so dev builds (tsc → server/out/) are not overwritten.
const serverBuild = esbuild.build({
    ...baseConfig,
    format: 'esm',
    entryPoints: ['server/src/server.ts'],
    outfile: 'dist/server/server.js',
    external: ['vscode'],
    banner: {
        // Provide createRequire for CJS dependencies bundled into ESM
        js: `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`,
    },
});

// Bundle the worker thread (ESM — runs inside a Worker in the server process)
// This bundles the 44k-line ANTLR parser into a single file, eliminating
// module resolution overhead on worker startup.
const workerBuild = esbuild.build({
    ...baseConfig,
    format: 'esm',
    entryPoints: ['server/src/parser/parseWorker.ts'],
    outfile: 'dist/server/parser/parseWorker.js',
    banner: {
        js: `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`,
    },
});

// Bundle the MCP server (ESM — standalone stdio-based MCP server)
const mcpBuild = esbuild.build({
    ...baseConfig,
    format: 'esm',
    entryPoints: ['server/src/mcpServer.ts'],
    outfile: 'dist/server/mcpServer.mjs',
    banner: {
        js: [
            `#!/usr/bin/env node`,
            `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`,
        ].join('\n'),
    },
});

// Bundle the client (CJS — VS Code extension host expects CommonJS)
const clientBuild = esbuild.build({
    ...baseConfig,
    format: 'cjs',
    entryPoints: ['client/src/extension.ts'],
    outfile: 'dist/client/extension.js',
    external: ['vscode'],
});

await Promise.all([serverBuild, workerBuild, mcpBuild, clientBuild]);
console.log(isProduction ? '✅ Production build complete' : '✅ Build complete');
