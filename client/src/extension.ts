import * as path from 'path';
import { ExtensionContext, workspace } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node.js';

let client: LanguageClient;

export function activate(context: ExtensionContext): void {
    // Path to the server module
    const serverModule = context.asAbsolutePath(
        path.join('server', 'out', 'server.js')
    );

    // Debug options: the server is started with --inspect for debugging
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    // Server options: run and debug configurations
    const serverOptions: ServerOptions = {
        run: {
            module: serverModule,
            transport: TransportKind.ipc,
        },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions,
        },
    };

    // Client options: register for SysML documents
    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: 'file', language: 'sysml' },
            { scheme: 'untitled', language: 'sysml' },
        ],
        synchronize: {
            // Notify the server about file changes to .sysml and .kerml files
            fileEvents: workspace.createFileSystemWatcher('**/*.{sysml,kerml}'),
        },
    };

    // Create and start the language client
    client = new LanguageClient(
        'sysmlLanguageServer',
        'SysML v2 Language Server',
        serverOptions,
        clientOptions,
    );

    // Start the client — this also starts the server
    client.start();
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
