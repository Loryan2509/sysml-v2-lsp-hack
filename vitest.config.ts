import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    resolve: {
        alias: {
            'vscode-languageserver-textdocument': resolve(__dirname, 'server/node_modules/vscode-languageserver-textdocument'),
            'vscode-languageserver/node.js': resolve(__dirname, 'server/node_modules/vscode-languageserver/node.js'),
        },
    },
    test: {
        include: ['test/unit/**/*.test.ts'],
        globals: true,
        environment: 'node',
        testTimeout: 30000,
    },
});
