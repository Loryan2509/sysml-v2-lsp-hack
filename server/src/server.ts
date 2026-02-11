import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    DiagnosticSeverity,
    Diagnostic,
    TextDocumentPositionParams,
    Hover,
    DefinitionParams,
    Location,
    ReferenceParams,
    DocumentSymbolParams,
    DocumentSymbol,
    FoldingRangeParams,
    FoldingRange,
    RenameParams,
    WorkspaceEdit,
    SemanticTokensParams,
    SemanticTokens,
    SemanticTokensBuilder,
    SemanticTokensLegend,
} from 'vscode-languageserver/node.js';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentManager } from './documentManager.js';
import { DiagnosticsProvider } from './providers/diagnosticsProvider.js';
import { CompletionProvider } from './providers/completionProvider.js';
import { HoverProvider } from './providers/hoverProvider.js';
import { DefinitionProvider } from './providers/definitionProvider.js';
import { ReferencesProvider } from './providers/referencesProvider.js';
import { DocumentSymbolProvider } from './providers/documentSymbolProvider.js';
import { SemanticTokensProvider, tokenTypes, tokenModifiers } from './providers/semanticTokensProvider.js';
import { FoldingRangeProvider } from './providers/foldingRangeProvider.js';
import { RenameProvider } from './providers/renameProvider.js';

// Create a connection using all proposed LSP features
const connection = createConnection(ProposedFeatures.all);

// Text document manager — handles open/change/close lifecycle
const documents = new TextDocuments<TextDocument>(TextDocument);

// Core services
const documentManager = new DocumentManager();
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
    connection.console.log('SysML v2 Language Server initialized');
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
    // Clear diagnostics for closed documents
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

async function validateDocument(document: TextDocument): Promise<void> {
    // Parse and cache the document
    documentManager.parse(document);

    // Send diagnostics
    const diagnostics = diagnosticsProvider.getDiagnostics(document.uri);
    connection.sendDiagnostics({ uri: document.uri, diagnostics });
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
// Start
// --------------------------------------------------------------------------

documents.listen(connection);
connection.listen();
