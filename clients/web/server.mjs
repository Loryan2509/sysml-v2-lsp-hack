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

function extractLLMTextContent(llmData) {
    const rawContent = llmData?.choices?.[0]?.message?.content;
    if (Array.isArray(rawContent)) {
        return rawContent.map(part => typeof part === "string" ? part : (part?.text ?? "")).join("");
    }
    if (typeof rawContent === "string") {
        return rawContent;
    }
    return rawContent?.text ?? "";
}

function normalizeSysmlResponse(text) {
    if (!text) return "";
    const fenced = text.match(/```(?:sysml)?\s*([\s\S]*?)```/i);
    return (fenced ? fenced[1] : text).trim();
}

function extractOverallScore(text) {
    if (!text) return null;
    const patterns = [
        /Overall\s+(?:Assessment\s+)?Score\s*[=:]\s*([\d.]+)/i,
        /Overall\s+Score\s*[=:]\s*([\d.]+)/i,
        /\*\*Overall.*?Score.*?\*\*.*?([\d.]+)/i,
        /score\s*[=:]\s*([\d.]+)/i,
    ];
    for (const p of patterns) {
        const match = text.match(p);
        if (!match) continue;
        const value = parseFloat(match[1]);
        if (Number.isFinite(value) && value >= 0 && value <= 1) {
            return value;
        }
    }
    return null;
}

import { createServer } from "http";
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname, extname, join, sep } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === "--port") ?? "3000", 10);

// Resolve the repo root from this script's location (clients/web/)
const REPO_ROOT = resolve(__dirname, "../..");
const SERVER_JS = join(REPO_ROOT, "dist/server/server.js");
const CRITERIA_DIR = join(REPO_ROOT, "ModelQualityCriteria");
const REVIEW_RUNS_DIR = join(REPO_ROOT, ".review-runs");
const FIXED_MODELS_DIR = join(REPO_ROOT, ".fixed-models");

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
        const examples = [];

        const exDir = join(REPO_ROOT, "examples");
        if (existsSync(exDir)) {
            const files = readdirSync(exDir).filter((f) => f.endsWith(".sysml"));
            files.forEach((f) => {
                examples.push({
                    name: f.replace(".sysml", ""),
                    code: readFileSync(join(exDir, f), "utf-8"),
                    source: "examples",
                });
            });
        }

        ensureFixedModelsDir();
        const fixedFiles = readdirSync(FIXED_MODELS_DIR)
            .filter((f) => f.endsWith(".sysml"))
            .sort()
            .reverse();
        fixedFiles.forEach((f) => {
            examples.push({
                name: `.fixed-models/${f}`,
                code: readFileSync(join(FIXED_MODELS_DIR, f), "utf-8"),
                source: "fixed-models",
            });
        });

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

    // --- API: GET /api/review-runs ---
    if (url.pathname === "/api/review-runs" && req.method === "GET") {
        try {
            ensureReviewRunsDir();
            const files = readdirSync(REVIEW_RUNS_DIR)
                .filter((name) => name.endsWith(".json"))
                .sort()
                .reverse();

            const runs = files.map((fileName) => {
                const fullPath = join(REVIEW_RUNS_DIR, fileName);
                const raw = JSON.parse(readFileSync(fullPath, "utf-8"));
                return buildReviewRunSummary(raw);
            });

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(runs));
        } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // --- API: POST /api/review-runs ---
    if (url.pathname === "/api/review-runs" && req.method === "POST") {
        try {
            const body = await readBody(req);
            const { report } = JSON.parse(body);
            if (!report?.results?.length) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Missing review report payload" }));
                return;
            }

            ensureReviewRunsDir();
            const runId = report.id || buildReviewRunId(report.timestamp);
            const stored = {
                ...report,
                id: runId,
                savedAt: new Date().toISOString(),
            };
            writeFileSync(join(REVIEW_RUNS_DIR, `${runId}.json`), JSON.stringify(stored, null, 2), "utf-8");

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, run: buildReviewRunSummary(stored) }));
        } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // --- API: GET /api/review-runs/:id ---
    if (url.pathname.startsWith("/api/review-runs/") && req.method === "GET") {
        try {
            ensureReviewRunsDir();
            const runId = sanitizeReviewRunId(url.pathname.slice("/api/review-runs/".length));
            if (!runId) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Invalid review run id" }));
                return;
            }

            const fullPath = join(REVIEW_RUNS_DIR, `${runId}.json`);
            if (!existsSync(fullPath)) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Review run not found" }));
                return;
            }

            const raw = JSON.parse(readFileSync(fullPath, "utf-8"));
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(raw));
        } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // --- API: POST /api/fix-proposals ---
    if (url.pathname === "/api/fix-proposals" && req.method === "POST") {
        try {
            const body = await readBody(req);
            const { code, diagnostic, reviewIssue } = JSON.parse(body);
            const issue = reviewIssue || diagnostic;

            if (!code || !issue) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Missing 'code' or issue payload ('reviewIssue' or 'diagnostic')" }));
                return;
            }

            if (!LLM_API_KEY) {
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    error: "LLM not configured. Set LLM_API_KEY to the key provided for ai-gateway-eastus2.",
                    proposals: []
                }));
                return;
            }

            const { range, message, code: diagCode, severity, criterionName, criterionId, rawText } = issue;
            const lines = code.split('\n');
            const fallbackLine = 0;
            const startLine = Math.max(0, ((range?.start?.line ?? fallbackLine) - 2));
            const endLine = Math.min(lines.length, ((range?.end?.line ?? fallbackLine) + 3));
            const codeContext = lines.slice(startLine, endLine).join('\n');
            const numberedCode = lines
                .map((line, idx) => `${String(idx + 1).padStart(4, ' ')} | ${line}`)
                .join('\n');

            let criterionContent = null;
            try {
                if (criterionId) {
                    const directPath = join(CRITERIA_DIR, `${criterionId}.md`);
                    if (existsSync(directPath)) {
                        criterionContent = readFileSync(directPath, 'utf-8');
                    }
                }

                if (!criterionContent && criterionName) {
                    const normalized = criterionName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
                    const files = readdirSync(CRITERIA_DIR).filter(f => f.endsWith('.md'));
                    const fallbackFile = files.find(f => f.toLowerCase().includes(normalized));
                    if (fallbackFile) {
                        criterionContent = readFileSync(join(CRITERIA_DIR, fallbackFile), 'utf-8');
                    }
                }
            } catch (readErr) {
                console.warn('Failed to load criterion guidance for fix proposals:', readErr.message);
            }

            const trimmedCriterion = criterionContent
                ? criterionContent.slice(0, 8_000)
                : 'No additional criterion guidance was available. Use SysML best practices.';

            const prompt = `You are a SysML v2 modeling expert. Craft a SINGLE, production-ready fix for the review finding below by applying the cited quality criterion guidance. The fix must be directly actionable: update the model to resolve the cited deficiency, such as introducing missing requirements for uncovered attributes.

## Review Finding (verbatim)
${rawText || message}

## Criterion Guidance (${criterionId || criterionName || 'unknown'})
${trimmedCriterion}

## Issue Metadata
- Severity: ${severity === 1 ? 'Error' : severity === 2 ? 'Warning' : 'Info'}
- Diagnostic Code: ${diagCode || 'unknown'}
- Criterion: ${criterionName || criterionId || 'N/A'}
- Suspect Lines: ${startLine + 1}-${endLine}

## Code Context
\`\`\`sysml
${codeContext}
\`\`\`

## Full SysML Model (with line numbers)
\`\`\`sysml
${numberedCode}
\`\`\`

Deliver exactly one fix that updates the full model. Ensure new requirements, constraints, or allocations are added when review findings cite missing artifacts. Highlight deletions or edits as needed.

Respond ONLY with JSON using this schema:
{
    "fix": {
        "title": "Concise fix title",
        "description": "Why this fix resolves the issue",
        "code": "Complete updated SysML model",
        "changes": [
            {
                "type": "add|delete|alter",
                "description": "What changed and why",
                "before": "Previous SysML snippet or empty string",
                "after": "Updated SysML snippet or empty string"
            }
        ]
    }
}

Only output valid JSON, no other text.`;

            const llmUrl = `${LLM_BASE_URL.replace(/\/+$/, "")}/openai/deployments/${encodeURIComponent(LLM_MODEL)}/chat/completions?api-version=${LLM_API_VERSION}`;
            const llmRes = await fetch(llmUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "api-key": LLM_API_KEY,
                },
                body: JSON.stringify({
                    max_completion_tokens: 4096,
                    messages: [
                        {
                            role: "system",
                            content: "You are an expert SysML v2 modeling assistant who produces production-ready fixes.",
                        },
                        {
                            role: "user",
                            content: prompt,
                        },
                    ],
                }),
            });

            if (!llmRes.ok) {
                const errText = await llmRes.text();
                console.error(`LLM API error: ${llmRes.status} ${errText}`);
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    error: `LLM API error ${llmRes.status}`,
                    proposals: []
                }));
                return;
            }

            const llmData = await llmRes.json();
            const responseText = extractLLMTextContent(llmData);

            let proposals = [];
            try {
                // Extract JSON from the response
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.fix) {
                        proposals = [parsed.fix];
                    } else if (Array.isArray(parsed.fixes)) {
                        proposals = parsed.fixes;
                    }
                }
            } catch (e) {
                console.error("Failed to parse LLM response:", e.message);
                // Fallback: return empty proposals
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ proposals }));
        } catch (err) {
            console.error("Fix proposals error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message, proposals: [] }));
        }
        return;
    }

    // --- API: POST /api/resolve-selected-fixes ---
    if (url.pathname === "/api/resolve-selected-fixes" && req.method === "POST") {
        try {
            const body = await readBody(req);
            const { code, issues } = JSON.parse(body);

            if (!code?.trim()) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Missing 'code' payload" }));
                return;
            }
            if (!Array.isArray(issues) || !issues.length) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Missing 'issues' payload" }));
                return;
            }
            if (!LLM_API_KEY) {
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "LLM not configured. Set LLM_API_KEY environment variable." }));
                return;
            }

            const cappedIssues = issues.slice(0, 30);
            const issueSummary = cappedIssues.map((issue, idx) => {
                const startLine = (issue?.range?.start?.line ?? 0) + 1;
                const criterion = issue?.criterionName || issue?.criterionId || "unknown";
                const message = String(issue?.message || "").trim();
                const raw = String(issue?.rawText || "").trim().slice(0, 600);
                return `### Issue ${idx + 1}\n- Criterion: ${criterion}\n- Line: ${startLine}\n- Message: ${message || "N/A"}\n- Evidence:\n${raw || "N/A"}`;
            }).join("\n\n");

            const numberedCode = code
                .split("\n")
                .map((line, idx) => `${String(idx + 1).padStart(4, " ")} | ${line}`)
                .join("\n");

            const prompt = `You are a senior SysML v2 quality engineer.

Task: Produce one consolidated revised SysML model that resolves all listed issues together and maximizes review quality score.

Hard constraints:
- Output complete SysML model text only.
- Keep existing intent and domain semantics unless a listed issue requires change.
- Ensure consistency across related elements (parts, requirements, constraints, interfaces, flows).
- Avoid introducing duplicate or conflicting definitions.
- Prefer coherent, model-wide edits over local patches.

Selected issues to resolve:
${issueSummary}

Current SysML model (with line numbers):
${numberedCode}`;

            const llmUrl = `${LLM_BASE_URL.replace(/\/+$/, "")}/openai/deployments/${encodeURIComponent(LLM_MODEL)}/chat/completions?api-version=${LLM_API_VERSION}`;
            const llmRes = await fetch(llmUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "api-key": LLM_API_KEY,
                },
                body: JSON.stringify({
                    max_completion_tokens: 8192,
                    messages: [
                        {
                            role: "system",
                            content: "You improve SysML v2 model quality and return only complete corrected SysML text.",
                        },
                        {
                            role: "user",
                            content: prompt,
                        },
                    ],
                }),
            });

            if (!llmRes.ok) {
                const errText = await llmRes.text();
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: `LLM API error ${llmRes.status}`, details: errText.slice(0, 2000) }));
                return;
            }

            const llmData = await llmRes.json();
            const candidate = normalizeSysmlResponse(extractLLMTextContent(llmData));
            if (!candidate) {
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "LLM returned empty consolidated model output" }));
                return;
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, code: candidate }));
        } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // --- API: POST /api/repair-sysml ---
    if (url.pathname === "/api/repair-sysml" && req.method === "POST") {
        try {
            const body = await readBody(req);
            const { code, label } = JSON.parse(body);

            if (!code?.trim()) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Missing 'code' payload" }));
                return;
            }

            let candidate = code;
            const maxPasses = 4;

            for (let pass = 0; pass <= maxPasses; pass += 1) {
                const analysis = await lsp.openAndAnalyse(candidate);
                const diagnostics = analysis?.diagnostics ?? [];
                const errors = diagnostics.filter((diag) => diag.severity === 1);

                if (!errors.length) {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        ok: true,
                        repaired: pass > 0,
                        passes: pass,
                        code: candidate,
                        diagnostics,
                    }));
                    return;
                }

                if (!LLM_API_KEY) {
                    res.writeHead(503, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        ok: false,
                        error: "LLM not configured for auto-repair. Set LLM_API_KEY.",
                        diagnostics: errors.slice(0, 50),
                    }));
                    return;
                }

                if (pass === maxPasses) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        ok: false,
                        error: `Unable to repair SysML after ${maxPasses} pass${maxPasses === 1 ? "" : "es"}`,
                        diagnostics: errors.slice(0, 50),
                        code: candidate,
                    }));
                    return;
                }

                const numberedCode = candidate
                    .split("\n")
                    .map((line, idx) => `${String(idx + 1).padStart(4, " ")} | ${line}`)
                    .join("\n");
                const errorSummary = errors.slice(0, 80).map((diag) => {
                    const line = (diag.range?.start?.line ?? 0) + 1;
                    const col = (diag.range?.start?.character ?? 0) + 1;
                    return `- L${line}:${col} ${diag.message}`;
                }).join("\n");

                const prompt = `You are a SysML v2 syntax repair assistant.

Task: Repair the SysML model so it parses with zero syntax/semantic errors reported by the checker.
Context label: ${label || "bulk-fix"}

Constraints:
- Preserve intended model meaning and existing element names where possible.
- Make minimal structural edits needed to resolve parser/validator errors.
- Prioritize structural correctness: balanced delimiters, valid block nesting, and complete declarations.
- Return the complete corrected SysML model.
- Do not include markdown, explanations, or JSON.

Current errors:
${errorSummary}

Current model with line numbers:
${numberedCode}`;

                const llmUrl = `${LLM_BASE_URL.replace(/\/+$/, "")}/openai/deployments/${encodeURIComponent(LLM_MODEL)}/chat/completions?api-version=${LLM_API_VERSION}`;
                const llmRes = await fetch(llmUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "api-key": LLM_API_KEY,
                    },
                    body: JSON.stringify({
                        max_completion_tokens: 4096,
                        messages: [
                            {
                                role: "system",
                                content: "You repair SysML models and return only full corrected SysML text.",
                            },
                            {
                                role: "user",
                                content: prompt,
                            },
                        ],
                    }),
                });

                if (!llmRes.ok) {
                    const errText = await llmRes.text();
                    res.writeHead(503, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        ok: false,
                        error: `LLM API error ${llmRes.status}`,
                        details: errText.slice(0, 2000),
                        diagnostics: errors.slice(0, 50),
                    }));
                    return;
                }

                const llmData = await llmRes.json();
                const repairedText = normalizeSysmlResponse(extractLLMTextContent(llmData));
                if (!repairedText) {
                    res.writeHead(503, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        ok: false,
                        error: "LLM returned empty repair output",
                        diagnostics: errors.slice(0, 50),
                    }));
                    return;
                }

                candidate = repairedText;
            }
        } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // --- API: POST /api/review-scores ---
    if (url.pathname === "/api/review-scores" && req.method === "POST") {
        try {
            const body = await readBody(req);
            const { code, criteria } = JSON.parse(body);

            if (!code?.trim()) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Missing 'code' payload" }));
                return;
            }
            if (!Array.isArray(criteria) || !criteria.length) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Missing 'criteria' payload" }));
                return;
            }
            if (!LLM_API_KEY) {
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "LLM not configured. Set LLM_API_KEY environment variable." }));
                return;
            }

            const requestedCriteria = criteria
                .map((item) => String(item || "").trim())
                .filter(Boolean)
                .slice(0, 12);
            const results = [];

            for (const criterionId of requestedCriteria) {
                const criterionFile = join(CRITERIA_DIR, `${criterionId}.md`);
                if (!existsSync(criterionFile)) {
                    results.push({ criterionId, score: null, error: "Criterion file not found" });
                    continue;
                }

                const criterionContent = readFileSync(criterionFile, "utf-8");
                const prompt = `Assess this SysML v2 model for ONLY the criterion below and return one line exactly in this format:\nOverall Assessment Score: <number between 0 and 1>\n\nCriterion:\n${criterionContent.slice(0, 9000)}\n\nModel:\n\`\`\`sysml\n${code}\n\`\`\``;

                const llmUrl = `${LLM_BASE_URL.replace(/\/+$/, "")}/openai/deployments/${encodeURIComponent(LLM_MODEL)}/chat/completions?api-version=${LLM_API_VERSION}`;
                const llmRes = await fetch(llmUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "api-key": LLM_API_KEY,
                    },
                    body: JSON.stringify({
                        max_completion_tokens: 256,
                        temperature: 0,
                        messages: [
                            {
                                role: "system",
                                content: "You are a strict SysML assessor. Return exactly one score line in the requested format.",
                            },
                            {
                                role: "user",
                                content: prompt,
                            },
                        ],
                    }),
                });

                if (!llmRes.ok) {
                    const errText = await llmRes.text();
                    results.push({ criterionId, score: null, error: `LLM API error ${llmRes.status}: ${errText.slice(0, 300)}` });
                    continue;
                }

                const llmData = await llmRes.json();
                const text = extractLLMTextContent(llmData);
                results.push({ criterionId, score: extractOverallScore(text), raw: text.slice(0, 300) });
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, results }));
        } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // --- API: POST /api/save-fixed-model ---
    if (url.pathname === "/api/save-fixed-model" && req.method === "POST") {
        try {
            const body = await readBody(req);
            const { code, sourceName, reviewRunId, issueLabel } = JSON.parse(body);

            if (!code?.trim()) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Missing 'code' payload" }));
                return;
            }

            const analysis = await lsp.openAndAnalyse(code);
            const diagnostics = analysis?.diagnostics ?? [];
            const errors = diagnostics.filter((diag) => diag.severity === 1);
            if (errors.length) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    error: `Refusing to save invalid SysML (${errors.length} error${errors.length === 1 ? "" : "s"})`,
                    diagnostics: errors.slice(0, 10),
                }));
                return;
            }

            ensureFixedModelsDir();
            const safeSource = sanitizeFileStem(sourceName || "model");
            const safeRun = sanitizeFileStem(reviewRunId || "manual");
            const safeIssue = sanitizeFileStem(issueLabel || "fix");
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const fileName = `${safeSource}__${safeRun}__${safeIssue}__${timestamp}.sysml`;
            const targetPath = join(FIXED_MODELS_DIR, fileName);

            writeFileSync(targetPath, code, "utf-8");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, fileName, relativePath: `.fixed-models/${fileName}` }));
        } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
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

const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB limit

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

function ensureReviewRunsDir() {
    if (!existsSync(REVIEW_RUNS_DIR)) {
        mkdirSync(REVIEW_RUNS_DIR, { recursive: true });
    }
}

function ensureFixedModelsDir() {
    if (!existsSync(FIXED_MODELS_DIR)) {
        mkdirSync(FIXED_MODELS_DIR, { recursive: true });
    }
}

function buildReviewRunId(timestamp) {
    const base = (timestamp || new Date().toISOString()).replace(/[:.]/g, "-");
    return `review-${base}`;
}

function sanitizeReviewRunId(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function sanitizeFileStem(value) {
    return String(value || "")
        .replace(/\.sysml$/i, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "item";
}

function buildReviewRunSummary(report) {
    return {
        id: report.id || buildReviewRunId(report.timestamp),
        timestamp: report.timestamp,
        savedAt: report.savedAt || null,
        files: report.files || [],
        criteria: report.criteria || [],
        overallScore: report.overallScore ?? null,
        resultCount: report.results?.length ?? 0,
    };
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
