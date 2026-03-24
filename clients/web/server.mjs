#!/usr/bin/env node
/**
 * SysML v2 Web Client — Lightweight HTTP bridge
 *
 * Spawns the LSP server as a child process and exposes a simple REST API
 * for the web frontend. Also serves the static HTML/JS/CSS.
 *
 * Usage:
 *   node clients/web/server.mjs [--port 3000]
 */

import { createServer } from "http";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, extname, join, sep } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === "--port") ?? "3000", 10);

// Resolve the repo root from this script's location (clients/web/)
const REPO_ROOT = resolve(__dirname, "../..");
const SERVER_JS = join(REPO_ROOT, "dist/server/server.js");
const CRITERIA_DIR = join(REPO_ROOT, "ModelQualityCriteria");

// LLM configuration via environment variables
const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://ai-gateway-eastus2.azure-api.net";
const LLM_API_KEY = process.env.LLM_API_KEY || "9ad3ded3800d457ba76029a6b3bcaa52";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-5.4";
const LLM_API_VERSION = process.env.LLM_API_VERSION || "2024-10-21";

if (!existsSync(SERVER_JS)) {
    console.error(`\x1b[31mERROR:\x1b[0m Server bundle not found at ${SERVER_JS}`);
    console.error('Run "npm run build" from the repository root first.');
    process.exit(1);
}

// ---------------------------------------------------------------------------
// LSP Client — minimal JSON-RPC over stdio
// ---------------------------------------------------------------------------

class LspClient {
    constructor() {
        this._id = 0;
        this._pending = new Map();
        this._diagnostics = new Map();
        this._buffer = Buffer.alloc(0);
        this._proc = null;
    }

    start() {
        this._proc = spawn("node", [SERVER_JS, "--stdio"], {
            cwd: REPO_ROOT,
            stdio: ["pipe", "pipe", "pipe"],
        });

        this._proc.stdout.on("data", (chunk) => this._onData(chunk));
        this._proc.stderr.on("data", (d) => {
            // Suppress noisy stderr unless debugging
            if (process.env.DEBUG) process.stderr.write(d);
        });
        this._proc.on("exit", (code) => {
            console.log(`LSP server exited (code ${code})`);
        });

        return this._request("initialize", {
            processId: process.pid,
            rootUri: `file://${REPO_ROOT}`,
            capabilities: {
                textDocument: {
                    publishDiagnostics: { relatedInformation: true },
                    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
                    hover: { contentFormat: ["plaintext", "markdown"] },
                    completion: { completionItem: { snippetSupport: false } },
                },
            },
            workspaceFolders: [{ uri: `file://${REPO_ROOT}`, name: "sysml-v2-lsp" }],
        }).then(() => {
            this._notify("initialized");
            console.log("LSP server initialized");
        });
    }

    // --- API ----------------------------------------------------------------

    async openAndAnalyse(code, uri = "file:///virtual/editor.sysml") {
        this._version = (this._version ?? 0) + 1;
        const expectedVersion = this._version;

        // Close previous version if open — and drain the stale close notification
        if (this._openDocs?.has(uri)) {
            this._diagnostics.delete(uri);
            this._notify("textDocument/didClose", { textDocument: { uri } });
            // Give Node event loop a tick to process the stale empty diagnostics
            await new Promise(r => setTimeout(r, 50));
            // Drain any buffered data (close notification's empty diagnostics)
            // so they don't interfere with the real waiter
        }

        // Clear diagnostics and set up waiter BEFORE opening
        this._diagnostics.delete(uri);
        this._diagWaiters?.delete(uri);
        const diagPromise = this._waitForStatusEnd(uri, 15_000);

        // Open with new content
        this._notify("textDocument/didOpen", {
            textDocument: { uri, languageId: "sysml", version: expectedVersion, text: code },
        });
        if (!this._openDocs) this._openDocs = new Set();
        this._openDocs.add(uri);

        // Wait for parse completion (sysml/status end notification)
        await diagPromise;
        const diagnostics = this._diagnostics.get(uri) ?? [];

        // Get symbols
        const symbolResult = await this._request("textDocument/documentSymbol", {
            textDocument: { uri },
        });
        const symbols = symbolResult?.result ?? [];

        // Get model with mermaid-relevant data
        let model = null;
        try {
            model = await this._request("sysml/model", {
                textDocument: { uri },
                scope: ["elements", "relationships", "diagnostics"],
            });
        } catch { /* model request may not be available */ }

        return { diagnostics, symbols, model: model?.result ?? null };
    }

    async shutdown() {
        const timeout = (ms) => new Promise((_, reject) =>
            setTimeout(() => reject(new Error("shutdown timed out")), ms));
        try {
            await Promise.race([this._request("shutdown"), timeout(2000)]);
            this._notify("exit");
        } catch { /* timed out or LSP already gone */ }
        this._proc?.kill();
    }

    // --- Transport ----------------------------------------------------------

    _send(msg) {
        const body = JSON.stringify(msg);
        const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
        this._proc.stdin.write(header + body);
    }

    _request(method, params) {
        return new Promise((resolve, reject) => {
            const id = ++this._id;
            this._pending.set(id, { resolve, reject });
            this._send({ jsonrpc: "2.0", id, method, ...(params !== undefined ? { params } : {}) });

            setTimeout(() => {
                if (this._pending.has(id)) {
                    this._pending.delete(id);
                    resolve(null);
                }
            }, 30_000);
        });
    }

    _notify(method, params) {
        this._send({ jsonrpc: "2.0", method, ...(params !== undefined ? { params } : {}) });
    }

    _onData(chunk) {
        this._buffer = Buffer.concat([this._buffer, chunk]);
        while (true) {
            const headerEnd = this._buffer.indexOf("\r\n\r\n");
            if (headerEnd === -1) break;
            const header = this._buffer.subarray(0, headerEnd).toString();
            const match = header.match(/Content-Length:\s*(\d+)/i);
            if (!match) break;
            const len = parseInt(match[1], 10);
            const bodyStart = headerEnd + 4;
            if (this._buffer.length < bodyStart + len) break;
            const body = this._buffer.subarray(bodyStart, bodyStart + len).toString();
            this._buffer = this._buffer.subarray(bodyStart + len);
            try {
                const msg = JSON.parse(body);
                this._handleMessage(msg);
            } catch { /* ignore malformed */ }
        }
    }

    _handleMessage(msg) {
        // Response to a request
        if (msg.id && this._pending.has(msg.id)) {
            this._pending.get(msg.id).resolve(msg);
            this._pending.delete(msg.id);
            return;
        }
        // Diagnostic notification
        if (msg.method === "textDocument/publishDiagnostics") {
            const { uri, diagnostics } = msg.params;
            this._diagnostics.set(uri, diagnostics);
        }
        // Parse-complete notification from our server
        if (msg.method === "sysml/status" && msg.params?.state === "end") {
            const uri = msg.params.uri;
            if (uri) {
                const waiters = this._statusWaiters?.get(uri);
                if (waiters) {
                    waiters.forEach(fn => fn());
                    this._statusWaiters.delete(uri);
                }
            }
        }
    }

    _waitForStatusEnd(uri, timeout) {
        return new Promise((resolve) => {
            if (!this._statusWaiters) this._statusWaiters = new Map();
            const list = this._statusWaiters.get(uri) ?? [];
            list.push(resolve);
            this._statusWaiters.set(uri, list);
            setTimeout(resolve, timeout);
        });
    }
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

const MIME = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
};

const lsp = new LspClient();

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    // --- API: POST /api/analyse ---
    if (url.pathname === "/api/analyse" && req.method === "POST") {
        try {
            const body = await readBody(req);
            const { code } = JSON.parse(body);
            if (!code) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Missing 'code' field" }));
                return;
            }
            const result = await lsp.openAndAnalyse(code);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
        } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // --- API: GET /api/examples ---
    if (url.pathname === "/api/examples" && req.method === "GET") {
        const exDir = join(REPO_ROOT, "examples");
        const files = readdirSync(exDir).filter((f) => f.endsWith(".sysml"));
        const examples = files.map((f) => ({
            name: f.replace(".sysml", ""),
            code: readFileSync(join(exDir, f), "utf-8"),
        }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(examples));
        return;
    }

    // --- API: GET /api/criteria ---
    if (url.pathname === "/api/criteria" && req.method === "GET") {
        try {
            const files = readdirSync(CRITERIA_DIR).filter(f => f.endsWith(".md") && !f.startsWith("_")).sort();
            const criteria = files.map(f => {
                const content = readFileSync(join(CRITERIA_DIR, f), "utf-8");
                const titleMatch = content.match(/^#\s+SysML v2 Model Assessment:\s*(.+)/m);
                const purposeMatch = content.match(/## Purpose\s+(.+?)(?:\n\n|\n##)/s);
                return {
                    id: f.replace(".md", ""),
                    name: titleMatch?.[1]?.trim() ?? f.replace(".md", ""),
                    description: purposeMatch?.[1]?.trim().split("\n")[0] ?? "",
                };
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(criteria));
        } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // --- API: GET /api/review/config ---
    if (url.pathname === "/api/review/config" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            configured: !!LLM_API_KEY,
            model: LLM_MODEL,
            baseUrl: LLM_BASE_URL.replace(/\/+$/, ""),
            apiVersion: LLM_API_VERSION,
        }));
        return;
    }

    // --- API: POST /api/review (SSE streaming) ---
    if (url.pathname === "/api/review" && req.method === "POST") {
        try {
            const body = await readBody(req);
            const { files, code, criteria } = JSON.parse(body);

            // Support both old single-code and new multi-file format
            const fileList = files?.length ? files : (code ? [{ name: 'model.sysml', code }] : []);

            if (!fileList.length || !criteria?.length) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Missing 'files' (or 'code') or 'criteria' fields" }));
                return;
            }

            if (!LLM_API_KEY) {
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "LLM not configured. Set LLM_API_KEY environment variable." }));
                return;
            }

            // Validate criteria IDs — must match existing criterion files (exclude shared protocol)
            const allFiles = readdirSync(CRITERIA_DIR).filter(f => f.endsWith(".md") && !f.startsWith("_")).map(f => f.replace(".md", ""));
            const invalid = criteria.filter(c => !allFiles.includes(c));

            // Load the shared protocol once and embed it in the system message
            const sharedProtocolPath = join(CRITERIA_DIR, "_shared_protocol.md");
            const sharedProtocol = existsSync(sharedProtocolPath)
                ? readFileSync(sharedProtocolPath, "utf-8")
                : "";
            if (invalid.length) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: `Unknown criteria: ${invalid.join(", ")}` }));
                return;
            }

            // Set up SSE
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            });

            const sendEvent = (event, data) => {
                res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
            };

            // Recommended execution order from the criteria files
            const EXEC_ORDER = [
                "01_completeness", "05_conflicting_requirements",
                "03_misrepresentation_conflation", "07_failure_modes_resilience",
                "02_correctness_intent", "06_contextual_plausibility",
                "04_redundancy", "08_abstraction_level_consistency",
                "09_assumptions_design_rationale", "10_emergent_system_properties",
            ];
            const ordered = criteria.sort((a, b) => {
                const ia = EXEC_ORDER.indexOf(a);
                const ib = EXEC_ORDER.indexOf(b);
                return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
            });

            sendEvent("start", { criteria: ordered, model: LLM_MODEL });

            // Process each criterion sequentially
            for (const criterionId of ordered) {
                const criterionFile = join(CRITERIA_DIR, `${criterionId}.md`);
                const criterionContent = readFileSync(criterionFile, "utf-8");
                const titleMatch = criterionContent.match(/^#\s+SysML v2 Model Assessment:\s*(.+)/m);
                const criterionName = titleMatch?.[1]?.trim() ?? criterionId;

                sendEvent("criterion-start", { id: criterionId, name: criterionName });

                try {
                    const llmUrl = `${LLM_BASE_URL.replace(/\/+$/, "")}/openai/deployments/${encodeURIComponent(LLM_MODEL)}/chat/completions?api-version=${LLM_API_VERSION}`;
                    const llmRes = await fetch(llmUrl, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "api-key": LLM_API_KEY,
                        },
                        body: JSON.stringify({
                            stream: true,
                            messages: [
                                {
                                    role: "system",
                                    content: `You are an expert SysML v2 model quality assessor. You will be given a quality assessment criterion and a SysML v2 model to review. Follow the assessment instructions precisely. Output findings in the exact ISSUE format specified in the criterion document. At the end, output the summary table and Overall Assessment Score.${sharedProtocol ? `\n\n---\n\n${sharedProtocol}` : ""}`,
                                },
                                {
                                    role: "user",
                                    content: `## Assessment Criterion\n\n${criterionContent}\n\n---\n\n## SysML v2 Model to Review\n\n${fileList.map(f => `### File: ${f.name}\n\`\`\`sysml\n${f.code}\n\`\`\``).join('\n\n')}\n\nPlease assess ${fileList.length > 1 ? 'these models' : 'this model'} against the criterion above. Follow the output format exactly as specified.`,
                                },
                            ],
                        }),
                    });

                    if (!llmRes.ok) {
                        const errText = await llmRes.text();
                        sendEvent("criterion-error", { id: criterionId, error: `LLM API error ${llmRes.status}: ${errText.slice(0, 500)}` });
                        continue;
                    }

                    // Stream the SSE response from the LLM
                    const reader = llmRes.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = "";

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });

                        // Parse SSE lines from LLM
                        const lines = buffer.split("\n");
                        buffer = lines.pop(); // keep incomplete line

                        for (const line of lines) {
                            if (!line.startsWith("data: ")) continue;
                            const payload = line.slice(6).trim();
                            if (payload === "[DONE]") continue;
                            try {
                                const chunk = JSON.parse(payload);
                                const content = chunk.choices?.[0]?.delta?.content;
                                if (content) {
                                    sendEvent("chunk", { id: criterionId, text: content });
                                }
                            } catch { /* skip malformed chunks */ }
                        }
                    }

                    sendEvent("criterion-end", { id: criterionId });
                } catch (err) {
                    sendEvent("criterion-error", { id: criterionId, error: err.message });
                }
            }

            sendEvent("done", {});
            res.end();
        } catch (err) {
            if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: err.message }));
            } else {
                res.end();
            }
        }
        return;
    }

    // --- Static files ---
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const publicDir = resolve(__dirname, "public");
    const fullPath = resolve(publicDir, filePath.replace(/^\/+/, ""));

    // Prevent path traversal — resolved path must be inside public/
    if (!fullPath.startsWith(publicDir + sep) && fullPath !== publicDir) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return;
    }

    if (existsSync(fullPath)) {
        const ext = extname(fullPath);
        res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
        res.end(readFileSync(fullPath));
    } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
    }
});

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB limit

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (c) => {
            data += c;
            if (data.length > MAX_BODY_SIZE) {
                req.destroy();
                reject(new Error("Request body too large"));
            }
        });
        req.on("end", () => resolve(data));
        req.on("error", reject);
    });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
    console.log("Starting SysML v2 Web Client...");
    await lsp.start();

    server.listen(PORT, () => {
        console.log(`\n\x1b[32m✓\x1b[0m SysML v2 Web Client running at \x1b[36mhttp://localhost:${PORT}\x1b[0m\n`);
    });

    process.on("SIGINT", async () => {
        console.log("\nShutting down...");
        // Force-exit after 3s in case graceful shutdown hangs
        const forceTimer = setTimeout(() => process.exit(1), 3000);
        forceTimer.unref();
        await lsp.shutdown();
        process.exit(0);
    });
}

main().catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
});
