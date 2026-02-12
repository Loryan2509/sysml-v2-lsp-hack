import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind,
    DidChangeConfigurationNotification,
    CompletionItem,
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
    SemanticTokensLegend,
    CodeActionParams,
    CodeAction,
    DocumentFormattingParams,
    DocumentRangeFormattingParams,
    TextEdit,
    SelectionRangeParams,
    SelectionRange,
    CodeLensParams,
    CodeLens,
    WorkspaceSymbolParams,
    SymbolInformation,
    LinkedEditingRangeParams,
    LinkedEditingRanges,
    InlayHintParams,
    InlayHint,
    DocumentLinkParams,
    DocumentLink,
    TypeHierarchyPrepareParams,
    TypeHierarchyItem,
    TypeHierarchySubtypesParams,
    TypeHierarchySupertypesParams,
    CallHierarchyPrepareParams,
    CallHierarchyItem,
    CallHierarchyIncomingCallsParams,
    CallHierarchyIncomingCall,
    CallHierarchyOutgoingCallsParams,
    CallHierarchyOutgoingCall,
    SignatureHelpParams,
    SignatureHelp,
} from 'vscode-languageserver/node.js';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DocumentManager } from './documentManager.js';
import { CompletionProvider } from './providers/completionProvider.js';
import { HoverProvider } from './providers/hoverProvider.js';
import { DefinitionProvider } from './providers/definitionProvider.js';
import { ReferencesProvider } from './providers/referencesProvider.js';
import { DocumentSymbolProvider } from './providers/documentSymbolProvider.js';
import { SemanticTokensProvider, tokenTypes, tokenModifiers } from './providers/semanticTokensProvider.js';
import { FoldingRangeProvider } from './providers/foldingRangeProvider.js';
import { RenameProvider } from './providers/renameProvider.js';
import { CodeActionProvider } from './providers/codeActionProvider.js';
import { FormattingProvider } from './providers/formattingProvider.js';
import { SelectionRangeProvider } from './providers/selectionRangeProvider.js';
import { CodeLensProvider } from './providers/codeLensProvider.js';
import { WorkspaceSymbolProvider } from './providers/workspaceSymbolProvider.js';
import { LinkedEditingRangeProvider } from './providers/linkedEditingRangeProvider.js';
import { InlayHintProvider } from './providers/inlayHintProvider.js';
import { DocumentLinkProvider } from './providers/documentLinkProvider.js';
import { TypeHierarchyProvider } from './providers/typeHierarchyProvider.js';
import { CallHierarchyProvider } from './providers/callHierarchyProvider.js';
import { SignatureHelpProvider } from './providers/signatureHelpProvider.js';

import type { ParseRequest, CancelRequest, ParseResponse } from './parser/parseWorker.js';

// Create a connection using all proposed LSP features
const connection = createConnection(ProposedFeatures.all);

// Text document manager — handles open/change/close lifecycle
const documents = new TextDocuments<TextDocument>(TextDocument);

// Core services
const documentManager = new DocumentManager();
documentManager.setDocuments(documents);
// NOTE: diagnostics are computed in the worker thread and assembled in handleParseResult()
const completionProvider = new CompletionProvider(documentManager);
const hoverProvider = new HoverProvider(documentManager);
const definitionProvider = new DefinitionProvider(documentManager);
const referencesProvider = new ReferencesProvider(documentManager);
const documentSymbolProvider = new DocumentSymbolProvider(documentManager);
const semanticTokensProvider = new SemanticTokensProvider(documentManager);
const foldingRangeProvider = new FoldingRangeProvider(documentManager);
const renameProvider = new RenameProvider(documentManager);
const codeActionProvider = new CodeActionProvider();
const formattingProvider = new FormattingProvider(documents);
const selectionRangeProvider = new SelectionRangeProvider(documents);
const codeLensProvider = new CodeLensProvider(documentManager);
const workspaceSymbolProvider = new WorkspaceSymbolProvider(documentManager);
const linkedEditingRangeProvider = new LinkedEditingRangeProvider(documentManager);
const inlayHintProvider = new InlayHintProvider(documentManager);
const documentLinkProvider = new DocumentLinkProvider(documentManager, documents);
const typeHierarchyProvider = new TypeHierarchyProvider(documentManager);
const callHierarchyProvider = new CallHierarchyProvider(documentManager, documents);
const signatureHelpProvider = new SignatureHelpProvider(documentManager, documents);

// ---------------------------------------------------------------------------
// Parse worker — offloads ANTLR parsing to a background thread
// ---------------------------------------------------------------------------

// __dirname that works in both ESM (tsc) and CJS (esbuild bundle)
let __ownDirname: string;
try {
    __ownDirname = dirname(fileURLToPath(import.meta.url));
} catch {
    // CJS fallback (esbuild bundle)
    __ownDirname = __dirname;
}

let parseWorker: Worker | null = null;
let nextRequestId = 1;

/** Pending parse callbacks keyed by request id */
const pendingParses = new Map<number, {
    uri: string;
    version: number;
    resolve: (resp: ParseResponse) => void;
}>();

function getParseWorker(): Worker {
    if (parseWorker) return parseWorker;
    const workerPath = join(__ownDirname, 'parser', 'parseWorker.js');
    parseWorker = new Worker(workerPath);

    parseWorker.on('message', (msg: ParseResponse & { warmup?: boolean; elapsed?: number; interrupted?: boolean; chunksCompleted?: number; totalChunks?: number }) => {
        // Handle DFA warm-up completion notification
        if (msg.warmup) {
            if (msg.interrupted) {
                connection.console.log(`[worker] DFA warm-up interrupted after ${msg.chunksCompleted}/${msg.totalChunks} chunks (${msg.elapsed}ms) — real parse took priority`);
            } else {
                connection.console.log(`[worker] DFA warm-up complete: ${msg.chunksCompleted}/${msg.totalChunks} chunks in ${msg.elapsed}ms`);
            }
            return;
        }

        const pending = pendingParses.get(msg.id);
        if (pending) {
            pendingParses.delete(msg.id);
            pending.resolve(msg);
        }
    });

    parseWorker.on('error', (err) => {
        connection.console.error(`[worker] error: ${err.message}`);
        // Reject all pending parses so they don't hang
        for (const [id, p] of pendingParses) {
            pendingParses.delete(id);
            // Resolve with empty result so diagnostics clear
            p.resolve({
                id,
                uri: p.uri,
                version: p.version,
                errors: [],
                keywordDiagnostics: [],
                semanticTokenData: [],
                timing: { lexMs: 0, parseMs: 0 },
                mode: 'SLL',
            });
        }
        parseWorker = null; // recreate on next use
    });

    parseWorker.on('exit', (code) => {
        if (code !== 0) {
            connection.console.error(`[worker] exited with code ${code}`);
        }
        parseWorker = null;
    });

    return parseWorker;
}

/**
 * Parse a document in the background worker thread.
 * Returns a promise that resolves with serialized parse results.
 */
function parseInWorker(text: string, uri: string, version: number): { id: number; promise: Promise<ParseResponse> } {
    const id = nextRequestId++;
    const worker = getParseWorker();

    const promise = new Promise<ParseResponse>((resolve) => {
        pendingParses.set(id, { uri, version, resolve });
        const req: ParseRequest = { id, text, uri, version };
        worker.postMessage(req);
    });

    return { id, promise };
}

function cancelWorkerParse(id: number): void {
    const worker = parseWorker;
    if (!worker) return;
    const cancel: CancelRequest = { id, cancel: true };
    worker.postMessage(cancel);
    pendingParses.delete(id);
}

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

            // Code actions (quick fixes)
            codeActionProvider: {
                codeActionKinds: ['quickfix'],
            },

            // Formatting
            documentFormattingProvider: true,
            documentRangeFormattingProvider: true,

            // Selection range (smart expand/shrink)
            selectionRangeProvider: true,

            // CodeLens (reference counts above definitions)
            codeLensProvider: {
                resolveProvider: false,
            },

            // Workspace symbols (Ctrl+T search)
            workspaceSymbolProvider: true,

            // Linked editing (mirror rename in same scope)
            linkedEditingRangeProvider: true,

            // Inlay hints (ghost type/supertype annotations)
            inlayHintProvider: true,

            // Document links (clickable imports)
            documentLinkProvider: {
                resolveProvider: false,
            },

            // Type hierarchy (specialization tree)
            typeHierarchyProvider: true,

            // Call hierarchy (action perform/include chains)
            callHierarchyProvider: true,

            // Signature help (parameter tooltips)
            signatureHelpProvider: {
                triggerCharacters: ['(', ','],
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

    // Start the worker immediately to begin DFA warm-up in the background.
    // By the time the user opens a large file, the DFA should be warm.
    getParseWorker();
    connection.console.log('[worker] started — warming DFA in background...');
});

// --------------------------------------------------------------------------
// Document sync — parse on open/change
// --------------------------------------------------------------------------

// Debounce timers per document URI — avoids re-parsing on every keystroke
const validationTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Active worker-parse request ID per URI, for cancellation */
const activeParseIds = new Map<string, number>();
/** Worker-computed semantic tokens per URI (used until main-thread parse is ready) */
const workerSemanticTokens = new Map<string, number[]>();
const DEBOUNCE_MS = 300; // ms to wait after last keystroke before parsing

documents.onDidOpen((event) => {
    connection.console.log(`[open] ${event.document.uri}`);
    // onDidChangeContent fires immediately after, which triggers validation
});

documents.onDidChangeContent((event) => {
    const uri = event.document.uri;

    // Cancel any pending validation for this document
    const existing = validationTimers.get(uri);
    if (existing) clearTimeout(existing);

    // Cancel any in-flight worker parse for this URI
    const activeId = activeParseIds.get(uri);
    if (activeId !== undefined) {
        cancelWorkerParse(activeId);
        activeParseIds.delete(uri);
    }

    // On first open (version 1), validate immediately; otherwise debounce
    const isInitialOpen = event.document.version <= 1;

    if (isInitialOpen) {
        validateDocumentAsync(event.document);
    } else {
        // Schedule a new validation after the debounce period
        const timer = setTimeout(() => {
            validationTimers.delete(uri);
            const doc = documents.get(uri);
            if (doc) {
                validateDocumentAsync(doc);
            }
        }, DEBOUNCE_MS);
        validationTimers.set(uri, timer);
    }
});

documents.onDidClose((event) => {
    const uri = event.document.uri;
    connection.console.log(`[close] ${uri}`);
    // Cancel pending debounce
    const timer = validationTimers.get(uri);
    if (timer) {
        clearTimeout(timer);
        validationTimers.delete(uri);
    }
    // Cancel in-flight worker parse
    const activeId = activeParseIds.get(uri);
    if (activeId !== undefined) {
        cancelWorkerParse(activeId);
        activeParseIds.delete(uri);
    }
    documentManager.remove(uri);
    connection.sendDiagnostics({ uri, diagnostics: [] });
});

async function validateDocumentAsync(document: TextDocument): Promise<void> {
    const uri = document.uri;
    const version = document.version;
    const text = document.getText();
    const fileName = uri.split('/').pop() ?? uri;

    connection.console.log(`[validate] ${fileName} — ${text.length} chars, parsing...`);

    // Show progress in the status bar
    const progress = await connection.window.createWorkDoneProgress();
    progress.begin('Parsing', undefined, `${fileName}…`);

    const totalStart = Date.now();

    // Dispatch to worker thread (non-blocking)
    const { id, promise } = parseInWorker(text, uri, version);
    activeParseIds.set(uri, id);

    const response = await promise;
    activeParseIds.delete(uri);

    const totalMs = Date.now() - totalStart;

    // Check the document hasn't changed while we were parsing
    const currentDoc = documents.get(uri);
    if (currentDoc && currentDoc.version !== version) {
        progress.done();
        connection.console.log(`[validate] ${fileName} — stale (v${version} → v${currentDoc.version}), discarding`);
        return;
    }

    // Build diagnostics from worker results
    const diagnostics: Diagnostic[] = [];

    for (const e of response.errors) {
        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
                start: { line: e.line, character: e.column },
                end: { line: e.line, character: e.column + e.length },
            },
            message: e.message,
            source: 'sysml',
        });
    }

    for (const kd of response.keywordDiagnostics) {
        diagnostics.push({
            severity: kd.severity as DiagnosticSeverity,
            range: kd.range,
            message: kd.message,
            source: kd.source ?? 'sysml',
        });
    }

    connection.sendDiagnostics({ uri, diagnostics });

    progress.done();

    connection.console.log(
        `[validate] ${fileName} — ` +
        `lex ${response.timing.lexMs}ms, ` +
        `parse ${response.timing.parseMs}ms (${response.mode}), ` +
        `total ${totalMs}ms, ` +
        `${diagnostics.length} diagnostic(s)`
    );

    // Cache worker-computed semantic tokens and tell VS Code to refresh.
    // This avoids a second cold main-thread parse (~22s) just for colorization.
    workerSemanticTokens.set(uri, response.semanticTokenData);
    connection.languages.semanticTokens.refresh();
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
        const uri = params.textDocument.uri;

        // Prefer the main-thread parse result if it's already cached
        // (warm DFA — ~50ms after the first file has been parsed)
        const cached = documentManager.get(uri);
        if (cached) {
            return semanticTokensProvider.provideSemanticTokens(params);
        }

        // Fall back to worker-computed tokens (avoids a 22s cold main-thread parse)
        const workerData = workerSemanticTokens.get(uri);
        if (workerData && workerData.length > 0) {
            return { data: workerData };
        }

        // Nothing available yet — return empty
        return { data: [] };
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

connection.onCodeAction(
    (params: CodeActionParams): CodeAction[] => {
        return codeActionProvider.provideCodeActions(params);
    }
);

connection.onDocumentFormatting(
    (params: DocumentFormattingParams): TextEdit[] => {
        return formattingProvider.provideDocumentFormatting(params);
    }
);

connection.onDocumentRangeFormatting(
    (params: DocumentRangeFormattingParams): TextEdit[] => {
        return formattingProvider.provideRangeFormatting(params);
    }
);

connection.onSelectionRanges(
    (params: SelectionRangeParams): SelectionRange[] => {
        return selectionRangeProvider.provideSelectionRanges(params);
    }
);

connection.onCodeLens(
    (params: CodeLensParams): CodeLens[] => {
        return codeLensProvider.provideCodeLenses(params);
    }
);

connection.onWorkspaceSymbol(
    (params: WorkspaceSymbolParams): SymbolInformation[] => {
        return workspaceSymbolProvider.provideWorkspaceSymbols(params);
    }
);

connection.languages.onLinkedEditingRange(
    (params: LinkedEditingRangeParams): LinkedEditingRanges | null => {
        return linkedEditingRangeProvider.provideLinkedEditingRanges(params);
    }
);

connection.languages.inlayHint.on(
    (params: InlayHintParams): InlayHint[] => {
        return inlayHintProvider.provideInlayHints(params);
    }
);

connection.onDocumentLinks(
    (params: DocumentLinkParams): DocumentLink[] => {
        return documentLinkProvider.provideDocumentLinks(params);
    }
);

connection.languages.typeHierarchy.onPrepare(
    (params: TypeHierarchyPrepareParams): TypeHierarchyItem[] | null => {
        return typeHierarchyProvider.prepareTypeHierarchy(params);
    }
);

connection.languages.typeHierarchy.onSupertypes(
    (params: TypeHierarchySupertypesParams): TypeHierarchyItem[] => {
        return typeHierarchyProvider.provideSupertypes(params);
    }
);

connection.languages.typeHierarchy.onSubtypes(
    (params: TypeHierarchySubtypesParams): TypeHierarchyItem[] => {
        return typeHierarchyProvider.provideSubtypes(params);
    }
);

connection.languages.callHierarchy.onPrepare(
    (params: CallHierarchyPrepareParams): CallHierarchyItem[] | null => {
        return callHierarchyProvider.prepareCallHierarchy(params);
    }
);

connection.languages.callHierarchy.onIncomingCalls(
    (params: CallHierarchyIncomingCallsParams): CallHierarchyIncomingCall[] => {
        return callHierarchyProvider.provideIncomingCalls(params);
    }
);

connection.languages.callHierarchy.onOutgoingCalls(
    (params: CallHierarchyOutgoingCallsParams): CallHierarchyOutgoingCall[] => {
        return callHierarchyProvider.provideOutgoingCalls(params);
    }
);

connection.onSignatureHelp(
    (params: SignatureHelpParams): SignatureHelp | null => {
        return signatureHelpProvider.provideSignatureHelp(params);
    }
);

// --------------------------------------------------------------------------
// Start
// --------------------------------------------------------------------------

documents.listen(connection);
connection.listen();
