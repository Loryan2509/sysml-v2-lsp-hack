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
    format: 'cjs',
    logLevel: 'info',
};

// Bundle the server
const serverBuild = esbuild.build({
    ...baseConfig,
    entryPoints: ['server/src/server.ts'],
    outfile: 'server/out/server.js',
    external: ['vscode'],
});

// Bundle the client
const clientBuild = esbuild.build({
    ...baseConfig,
    entryPoints: ['client/src/extension.ts'],
    outfile: 'client/out/extension.js',
    external: ['vscode'],
});

await Promise.all([serverBuild, clientBuild]);
console.log(isProduction ? '✅ Production build complete' : '✅ Build complete');
