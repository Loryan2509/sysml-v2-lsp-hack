import * as esbuild from 'esbuild';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const baseConfig = {
    bundle: true,
    minify: isProduction,
    keepNames: true,
    sourcemap: !isProduction,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    logLevel: 'info',
};

// Bundle the server
const serverBuild = esbuild.build({
    ...baseConfig,
    entryPoints: ['server/src/server.ts'],
    outfile: 'dist/server/server.js',
    external: ['vscode'],
});

// Bundle the MCP server
const mcpServerBuild = esbuild.build({
    ...baseConfig,
    entryPoints: ['server/src/mcpServer.ts'],
    outfile: 'dist/server/mcpServer.js',
    external: ['vscode'],
});

// Bundle the client
const clientBuild = esbuild.build({
    ...baseConfig,
    entryPoints: ['client/src/extension.ts'],
    outfile: 'dist/client/extension.js',
    external: ['vscode'],
});

await Promise.all([serverBuild, mcpServerBuild, clientBuild]);
console.log(isProduction ? '✅ Production build complete' : '✅ Build complete');
