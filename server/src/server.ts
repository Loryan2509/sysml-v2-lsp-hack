import {
    CompletionItem,
    createConnection,
    DefinitionParams,
    DidChangeConfigurationNotification,
    DocumentSymbol,
    DocumentSymbolParams,
    FoldingRange,
    FoldingRangeParams,
    Hover,
    InitializeParams,
    InitializeResult,
    Location,
    ProposedFeatures,
    ReferenceParams,
    RenameParams,
    SemanticTokens,
    SemanticTokensLegend,
    SemanticTokensParams,
    TextDocumentPositionParams,
    TextDocuments,
    TextDocumentSyncKind,
    WorkspaceEdit,
} from 'vscode-languageserver/node.js';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentManager } from './documentManager.js';
import { initLibraryIndex } from './library/libraryIndex.js';
import { SysMLModelProvider } from './model/sysmlModelProvider.js';
import type { SysMLModelParams } from './model/sysmlModelTypes.js';
import { CompletionProvider } from './providers/completionProvider.js';
import { DefinitionProvider } from './providers/definitionProvider.js';
import { DiagnosticsProvider } from './providers/diagnosticsProvider.js';
import { DocumentSymbolProvider } from './providers/documentSymbolProvider.js';
import { FoldingRangeProvider } from './providers/foldingRangeProvider.js';
import { HoverProvider } from './providers/hoverProvider.js';
import { ReferencesProvider } from './providers/referencesProvider.js';
import { RenameProvider } from './providers/renameProvider.js';
import { SemanticTokensProvider, tokenModifiers, tokenTypes } from './providers/semanticTokensProvider.js';
import { SemanticValidator } from './providers/semanticValidator.js';
import { validateKeywords } from './providers/keywordValidator.js';

// Create a connection using all proposed LSP features
const connection = createConnection(ProposedFeatures.all);

// Text document manager — handles open/change/close lifecycle
const documents = new TextDocuments<TextDocument>(TextDocument);

// Server start timestamp (for uptime reporting)
const serverStartTime = Date.now();

// Core services
const documentManager = new DocumentManager();
const modelProvider = new SysMLModelProvider(documentManager);
const diagnosticsProvider = new DiagnosticsProvider(documentManager);
const completionProvider = new CompletionProvider(documentManager);
const hoverProvider = new HoverProvider(documentManager);
const definitionProvider = new DefinitionProvider(documentManager);
const referencesProvider = new ReferencesProvider(documentManager);
const documentSymbolProvider = new DocumentSymbolProvider(documentManager);
const semanticTokensProvider = new SemanticTokensProvider(documentManager);
const foldingRangeProvider = new FoldingRangeProvider(documentManager);
const renameProvider = new RenameProvider(documentManager);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

// --------------------------------------------------------------------------
// Lifecycle
// --------------------------------------------------------------------------

connection.onInitialize((params: InitializeParams): InitializeResult => {
    const capabilities = params.capabilities;

    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );

    const legend: SemanticTokensLegend = {
        tokenTypes,
        tokenModifiers,
    };

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,

            // Completion
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['.', ':', ' '],
            },

            // Hover
            hoverProvider: true,

            // Go to definition
            definitionProvider: true,

            // Find references
            referencesProvider: true,

            // Document symbols (outline)
            documentSymbolProvider: true,

            // Semantic tokens
            semanticTokensProvider: {
                full: true,
                legend,
            },

            // Folding ranges
            foldingRangeProvider: true,

            // Rename
            renameProvider: {
                prepareProvider: true,
            },
        },
    };

    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true,
            },
        };
    }

    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(
            DidChangeConfigurationNotification.type,
            undefined
        );
    }

    // Bootstrap the standard library index for Go-to-Definition on
    // built-in types (String, Real, Boolean, etc.).
    const libCount = initLibraryIndex(__dirname);
    connection.console.log(`SysML v2 Language Server initialized (${libCount} library packages indexed)`);
});

// --------------------------------------------------------------------------
// Document sync — parse on open/change
// --------------------------------------------------------------------------

documents.onDidOpen((event) => {
    validateDocument(event.document);
});

documents.onDidChangeContent((event) => {
    validateDocument(event.document);
});

documents.onDidClose((event) => {
    documentManager.remove(event.document.uri);
    modelProvider.removeUri(event.document.uri);
    // Clear diagnostics for closed documents
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

async function validateDocument(document: TextDocument): Promise<void> {
    const fileName = document.uri.split('/').pop() ?? document.uri;

    // Notify the client that parsing has started
    connection.sendNotification('sysml/status', {
        state: 'begin',
        message: `Parsing ${fileName}`,
        fileName,
        uri: document.uri,
    });

    // Parse and cache the document
    documentManager.parse(document);

    // Collect diagnostics from all sources
    const diagnostics = diagnosticsProvider.getDiagnostics(document.uri);

    // Semantic validation (unused definitions, unresolved types, etc.)
    const semanticValidator = new SemanticValidator(documentManager);
    diagnostics.push(...semanticValidator.validate(document.uri));

    // Keyword validation (misspelled keywords)
    const parseResult = documentManager.get(document.uri);
    if (parseResult) {
        diagnostics.push(...validateKeywords(parseResult));
    }

    connection.sendDiagnostics({ uri: document.uri, diagnostics });

    // Notify the client that parsing is complete
    connection.sendNotification('sysml/status', {
        state: 'end',
        message: `Parsed ${fileName}`,
        fileName,
        uri: document.uri,
    });
}

// --------------------------------------------------------------------------
// LSP feature handlers
// --------------------------------------------------------------------------

connection.onCompletion(
    (params: TextDocumentPositionParams): CompletionItem[] => {
        return completionProvider.provideCompletions(params);
    }
);

connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        return completionProvider.resolveCompletion(item);
    }
);

connection.onHover(
    (params: TextDocumentPositionParams): Hover | null => {
        return hoverProvider.provideHover(params);
    }
);

connection.onDefinition(
    (params: DefinitionParams): Location | null => {
        return definitionProvider.provideDefinition(params);
    }
);

connection.onReferences(
    (params: ReferenceParams): Location[] => {
        return referencesProvider.provideReferences(params);
    }
);

connection.onDocumentSymbol(
    (params: DocumentSymbolParams): DocumentSymbol[] => {
        return documentSymbolProvider.provideDocumentSymbols(params);
    }
);

connection.languages.semanticTokens.on(
    (params: SemanticTokensParams): SemanticTokens => {
        return semanticTokensProvider.provideSemanticTokens(params);
    }
);

connection.onFoldingRanges(
    (params: FoldingRangeParams): FoldingRange[] => {
        return foldingRangeProvider.provideFoldingRanges(params);
    }
);

connection.onPrepareRename(
    (params: TextDocumentPositionParams) => {
        return renameProvider.prepareRename(params);
    }
);

connection.onRenameRequest(
    (params: RenameParams): WorkspaceEdit | null => {
        return renameProvider.provideRename(params);
    }
);

// --------------------------------------------------------------------------
// Custom LSP requests
// --------------------------------------------------------------------------

/**
 * `sysml/model` — returns the parsed semantic model for a document.
 * Drives the Model Explorer, Dashboard, Feature Inspector, and status bar metrics.
 */
connection.onRequest('sysml/model', (params: SysMLModelParams) => {
    return modelProvider.getModel(
        params.textDocument.uri,
        1,
        params.scope,
    );
});

/**
 * `sysml/serverStats` — returns server health/memory statistics.
 * Drives the LSP Health section of the status bar tooltip.
 */
connection.onRequest('sysml/serverStats', () => {
    const mem = process.memoryUsage();
    const toMB = (bytes: number) => Math.round(bytes / 1024 / 1024);
    return {
        uptime: Math.round((Date.now() - serverStartTime) / 1000),
        memory: {
            heapUsed: toMB(mem.heapUsed),
            heapTotal: toMB(mem.heapTotal),
            rss: toMB(mem.rss),
            external: toMB(mem.external),
        },
        caches: {
            documents: documentManager.getUris().length,
            symbolTables: modelProvider.cacheSize,
            semanticTokens: 0,
        },
    };
});

/**
 * `sysml/clearCache` — flushes all in-memory caches.
 * Returns the number of evicted entries per cache category.
 */
connection.onRequest('sysml/clearCache', () => {
    const docCount = documentManager.getUris().length;
    const stCount = modelProvider.clearAll();
    // Remove all cached documents
    for (const uri of documentManager.getUris()) {
        documentManager.remove(uri);
    }
    return {
        documents: docCount,
        symbolTables: stCount,
        semanticTokens: 0,
    };
});

// --------------------------------------------------------------------------
// Start
// --------------------------------------------------------------------------

documents.listen(connection);
connection.listen();
