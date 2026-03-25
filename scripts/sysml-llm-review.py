#!/usr/bin/env python3
"""SysML v2 LLM Review — CI/CD integration script.

Validates changed SysML files using the LSP server (diagnostics) and,
when an LLM API key is available, requests an AI-powered model quality
review.  Outputs a Markdown report suitable for posting as a GitHub PR
comment or Azure DevOps PR thread.

Usage:
    python3 scripts/sysml-llm-review.py [file1.sysml ...] [--output OUTFILE]

    # Auto-discover files changed in the current PR (git diff)
    python3 scripts/sysml-llm-review.py --output review.md

    # Explicit file list
    python3 scripts/sysml-llm-review.py examples/foo.sysml --output review.md

Environment variables (all optional — enables LLM review):
    OPENAI_API_KEY              OpenAI API key
    OPENAI_MODEL                Model to use (default: gpt-4o-mini)
    AZURE_OPENAI_ENDPOINT       https://<resource>.openai.azure.com
    AZURE_OPENAI_KEY            Azure OpenAI key
    AZURE_OPENAI_DEPLOYMENT     Deployment name (e.g. gpt-4o)
    AZURE_OPENAI_API_VERSION    API version (default: 2024-08-01-preview)
    BASE_SHA                    Base commit SHA for git diff (default: HEAD~1)
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# JSON-RPC / LSP transport (identical to clients/python/sysml_lsp_client.py)
# ---------------------------------------------------------------------------

SEVERITY = {1: "Error", 2: "Warning", 3: "Info", 4: "Hint"}
SEVERITY_ICON = {1: "🔴", 2: "🟡", 3: "🔵", 4: "⚪"}


class JsonRpcClient:
    """Minimal JSON-RPC 2.0 client speaking LSP's Content-Length framing."""

    def __init__(self, process: subprocess.Popen):  # type: ignore[type-arg]
        self._proc = process
        self._id = 0
        self._open_docs: dict[str, int] = {}
        self._diagnostics: dict[str, list[dict[str, Any]]] = {}

    def _send(self, msg: dict[str, Any]) -> None:
        body = json.dumps(msg)
        header = f"Content-Length: {len(body)}\r\n\r\n"
        self._proc.stdin.write(header.encode("utf-8"))
        self._proc.stdin.write(body.encode("utf-8"))
        self._proc.stdin.flush()

    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self._id += 1
        msg: dict[str, Any] = {"jsonrpc": "2.0", "id": self._id, "method": method}
        if params is not None:
            msg["params"] = params
        self._send(msg)
        return self._wait_for_response(self._id)

    def notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        msg: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            msg["params"] = params
        self._send(msg)

    def _read_headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        while True:
            line = self._proc.stdout.readline()
            if not line or line == b"\r\n":
                break
            key, _, val = line.decode("utf-8").partition(":")
            headers[key.strip().lower()] = val.strip()
        return headers

    def _read_message(self) -> dict[str, Any] | None:
        headers = self._read_headers()
        length = int(headers.get("content-length", 0))
        if length == 0:
            return None
        body = self._proc.stdout.read(length)
        return json.loads(body.decode("utf-8"))

    def _wait_for_response(self, req_id: int) -> dict[str, Any]:
        while True:
            msg = self._read_message()
            if msg is None:
                raise RuntimeError("Server closed the connection")
            if "id" in msg and msg["id"] == req_id:
                return msg
            if "method" in msg:
                self._handle_server_message(msg)

    def drain_until_diagnostics(self, uri: str, timeout: float = 30.0) -> None:
        import select

        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            remaining = max(deadline - time.monotonic(), 0)
            rlist, _, _ = select.select([self._proc.stdout], [], [], remaining)
            if not rlist:
                break
            msg = self._read_message()
            if msg is None:
                break
            if "method" in msg:
                self._handle_server_message(msg)
            if msg and msg.get("method") == "textDocument/publishDiagnostics":
                if msg.get("params", {}).get("uri") == uri:
                    break

    def _handle_server_message(self, msg: dict[str, Any]) -> None:
        if msg.get("method") == "textDocument/publishDiagnostics":
            uri = msg["params"]["uri"]
            self._diagnostics[uri] = msg["params"]["diagnostics"]

    def get_diagnostics(self, uri: str) -> list[dict[str, Any]]:
        return self._diagnostics.get(uri, [])


# ---------------------------------------------------------------------------
# LSP helpers
# ---------------------------------------------------------------------------

def file_uri(path: Path) -> str:
    return path.resolve().as_uri()


def start_server(server_js: Path) -> subprocess.Popen:  # type: ignore[type-arg]
    return subprocess.Popen(
        ["node", str(server_js), "--stdio"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def lsp_initialize(client: JsonRpcClient, root_path: Path) -> None:
    client.request("initialize", {
        "processId": os.getpid(),
        "rootUri": file_uri(root_path),
        "capabilities": {
            "textDocument": {
                "publishDiagnostics": {"relatedInformation": True},
            },
        },
        "workspaceFolders": [
            {"uri": file_uri(root_path), "name": root_path.name}
        ],
    })
    client.notify("initialized")


def open_document(client: JsonRpcClient, path: Path) -> str:
    uri = file_uri(path)
    if uri in client._open_docs:
        client.notify("textDocument/didClose", {"textDocument": {"uri": uri}})
        client._open_docs.pop(uri, None)
        time.sleep(0.2)
    text = path.read_text(encoding="utf-8")
    version = client._open_docs.get(uri, 0) + 1
    client.notify("textDocument/didOpen", {
        "textDocument": {
            "uri": uri,
            "languageId": "sysml",
            "version": version,
            "text": text,
        },
    })
    client._open_docs[uri] = version
    return uri


def lsp_shutdown(client: JsonRpcClient) -> None:
    try:
        client.request("shutdown")
        client.notify("exit")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Git helpers
# ---------------------------------------------------------------------------

def get_changed_sysml_files(base_sha: str, repo_root: Path) -> list[Path]:
    """Return .sysml/.kerml files changed between *base_sha* and HEAD."""
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "--diff-filter=ACM", base_sha, "HEAD"],
            capture_output=True,
            text=True,
            cwd=str(repo_root),
            check=True,
        )
        files: list[Path] = []
        for line in result.stdout.splitlines():
            p = repo_root / line.strip()
            if p.suffix in {".sysml", ".kerml"} and p.is_file():
                files.append(p)
        return files
    except subprocess.CalledProcessError:
        return []


# ---------------------------------------------------------------------------
# LLM API helpers
# ---------------------------------------------------------------------------

def _call_llm(messages: list[dict[str, str]], max_tokens: int = 16000) -> str | None:
    """Call OpenAI or Azure OpenAI chat completions; return assistant text or None."""
    azure_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", "").strip().rstrip("/")
    azure_key = os.environ.get("AZURE_OPENAI_KEY", "").strip()
    azure_deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "").strip()
    azure_api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-08-01-preview").strip()

    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    openai_model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip()

    if azure_endpoint and azure_key and azure_deployment:
        url = (
            f"{azure_endpoint}/openai/deployments/{azure_deployment}"
            f"/chat/completions?api-version={azure_api_version}"
        )
        headers = {
            "Content-Type": "application/json",
            "api-key": azure_key,
        }
        # Omit temperature — some newer models (e.g. reasoning models) do not support it
        payload = json.dumps({
            "messages": messages,
            "max_completion_tokens": max_tokens,
        }).encode("utf-8")
        print(f"[LLM] Using Azure OpenAI: {azure_endpoint}/openai/deployments/{azure_deployment}", file=sys.stderr)
    elif openai_key:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {openai_key}",
        }
        payload = json.dumps({
            "model": openai_model,
            "messages": messages,
            "max_completion_tokens": max_tokens,
            "temperature": 0.2,
        }).encode("utf-8")
        print(f"[LLM] Using OpenAI model: {openai_model}", file=sys.stderr)
    else:
        print("[LLM] No API credentials found — skipping AI review.", file=sys.stderr)
        return None

    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            print(f"[LLM] Response received ({len(raw)} bytes)", file=sys.stderr)
            data = json.loads(raw)
            if "choices" not in data:
                print(f"[LLM] Unexpected response shape — keys: {list(data.keys())}", file=sys.stderr)
                if "error" in data:
                    print(f"[LLM] Gateway error: {json.dumps(data['error'])}", file=sys.stderr)
                return None
            choice = data["choices"][0]
            msg = choice.get("message", {})
            finish_reason = choice.get("finish_reason", "unknown")
            print(f"[LLM] finish_reason={finish_reason}, message keys={list(msg.keys())}", file=sys.stderr)
            content = msg.get("content") or ""
            # Reasoning models (o-series, gpt-5.x) may put output in reasoning_content
            if not content:
                content = msg.get("reasoning_content") or msg.get("refusal") or ""
            if not content:
                # Last resort: dump the full raw response (sanitised) so we can diagnose
                safe = raw.replace(azure_key, "***").replace(azure_deployment, "***")
                print(f"[LLM] Full response (sanitised): {safe}", file=sys.stderr)
                return None
            return content
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"[LLM] HTTP {exc.code} error from API", file=sys.stderr)
        # Sanitise body before printing in case secrets are embedded
        safe_body = body[:600].replace(azure_key, "***").replace(azure_deployment, "***")
        print(f"[LLM] Response body: {safe_body}", file=sys.stderr)
        return None
    except BaseException as exc:
        print(f"[LLM] Request failed ({type(exc).__name__}): {exc}", file=sys.stderr)
        return None


def build_review_prompt(code: str, diagnostics: list[dict[str, Any]], filename: str) -> list[dict[str, str]]:
    """Build the chat messages list for LLM review (mirrors mcpCore.ts handlePromptReviewSysml)."""
    diag_lines: list[str] = []
    for d in diagnostics:
        sev = SEVERITY.get(d.get("severity", 1), "?")
        line = d["range"]["start"]["line"] + 1
        col = d["range"]["start"]["character"] + 1
        msg = d.get("message", "")
        diag_lines.append(f"  {filename}:{line}:{col} [{sev}] {msg}")

    diag_section = "\n".join(diag_lines) if diag_lines else "  No diagnostics — file parses cleanly."

    system_msg = (
        "You are a SysML v2 expert assistant that reviews systems models for "
        "correctness, completeness, and adherence to SysML v2 best practices. "
        "Provide concise, actionable feedback with specific line references where possible."
    )

    user_msg = f"""Please review the following SysML v2 model.

## File
`{filename}`

## LSP Diagnostics
{diag_section}

## Source Code
```sysml
{code}
```

Please check for and report on:
1. **Syntax errors** — any parse or type errors (already flagged above) and suggested fixes
2. **Type specialisations** — missing `:>` specialisations or `:` type annotations
3. **Naming conventions** — PascalCase for definitions, camelCase for usages
4. **Documentation** — missing `doc /* ... */` comments on key definitions
5. **Structural completeness** — orphaned usages, missing ports, attributes, or constraints
6. **Model quality** — redundancy, conflicting constraints, abstraction level consistency

Format your response as Markdown with one section per check. End with an **Overall Assessment** paragraph and a score from 0 (needs major rework) to 1 (excellent).
"""

    return [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg},
    ]


# ---------------------------------------------------------------------------
# Markdown report builder
# ---------------------------------------------------------------------------

def build_markdown_report(
    file_results: list[dict[str, Any]],
    has_llm: bool,
    review_id: str,
) -> str:
    lines: list[str] = []
    lines.append("<!-- sysml-llm-review -->")
    lines.append("## 🔍 SysML Model Quality Review")
    lines.append("")

    if not file_results:
        lines.append("_No SysML/KerML files were changed in this PR._")
        return "\n".join(lines)

    total_errors = sum(
        sum(1 for d in r["diagnostics"] if d.get("severity") == 1)
        for r in file_results
    )
    total_warnings = sum(
        sum(1 for d in r["diagnostics"] if d.get("severity") == 2)
        for r in file_results
    )

    status_icon = "✅" if total_errors == 0 else "❌"
    lines.append(
        f"{status_icon} **{len(file_results)} file(s) reviewed** — "
        f"{total_errors} error(s), {total_warnings} warning(s)"
    )
    if has_llm:
        lines.append("_Enhanced with AI model quality review._")
    else:
        lines.append(
            "_LSP diagnostics only. Set `OPENAI_API_KEY` or Azure OpenAI secrets "
            "for AI-powered review._"
        )
    lines.append("")

    for result in file_results:
        filename = result["filename"]
        rel_name = result["rel_name"]
        diags = result["diagnostics"]
        llm_text = result.get("llm_review")

        lines.append(f"### 📄 `{rel_name}`")
        lines.append("")

        # Diagnostics table
        if diags:
            lines.append("**LSP Diagnostics**")
            lines.append("")
            lines.append("| Severity | Line | Message |")
            lines.append("|----------|------|---------|")
            for d in diags:
                sev_num = d.get("severity", 1)
                sev = SEVERITY.get(sev_num, "?")
                icon = SEVERITY_ICON.get(sev_num, "⚪")
                line_num = d["range"]["start"]["line"] + 1
                col_num = d["range"]["start"]["character"] + 1
                msg = d.get("message", "").replace("|", "\\|")
                lines.append(f"| {icon} {sev} | {line_num}:{col_num} | {msg} |")
            lines.append("")
        else:
            lines.append("**LSP Diagnostics:** ✅ No issues found")
            lines.append("")

        # LLM review
        if llm_text:
            lines.append("<details>")
            lines.append("<summary><strong>AI Model Quality Review</strong></summary>")
            lines.append("")
            lines.append(llm_text)
            lines.append("")
            lines.append("</details>")
            lines.append("")

    lines.append("---")
    lines.append(f"_Review ID: `{review_id}`_")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SysML v2 LLM review for CI/CD")
    parser.add_argument(
        "files",
        nargs="*",
        help="SysML/KerML files to review. If omitted, auto-discovers via git diff.",
    )
    parser.add_argument(
        "--output",
        "-o",
        default="-",
        help="Write Markdown report to this file (default: stdout)",
    )
    parser.add_argument(
        "--json-output",
        default=None,
        help="Also write a JSON review record to this path.",
    )
    parser.add_argument(
        "--base-sha",
        default=os.environ.get("BASE_SHA", "HEAD~1"),
        help="Base commit SHA for git diff (default: HEAD~1 or $BASE_SHA env var)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    # Resolve repo root from script location: scripts/ -> repo root
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    server_js = repo_root / "dist" / "server" / "server.js"

    if not server_js.exists():
        print(
            f"ERROR: Server bundle not found at {server_js}\n"
            "Run 'npm run build' from the repository root first.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Determine which files to review
    if args.files:
        sysml_files = [Path(f).resolve() for f in args.files]
    else:
        sysml_files = get_changed_sysml_files(args.base_sha, repo_root)

    sysml_files = [f for f in sysml_files if f.is_file()]

    now = datetime.now(timezone.utc)
    review_id = f"review-{now.strftime('%Y-%m-%dT%H-%M-%S')}-{now.microsecond // 1000:03d}Z"

    if not sysml_files:
        print("[review] No SysML/KerML files to review.", file=sys.stderr)
        report = build_markdown_report([], has_llm=False, review_id=review_id)
        _write_output(args.output, report)
        return

    print(f"[review] Starting LSP server: {server_js.relative_to(repo_root)}", file=sys.stderr)
    proc = start_server(server_js)
    client = JsonRpcClient(proc)
    file_results: list[dict[str, Any]] = []

    try:
        lsp_initialize(client, repo_root)

        for sysml_file in sysml_files:
            rel = (
                sysml_file.relative_to(repo_root)
                if sysml_file.is_relative_to(repo_root)
                else sysml_file
            )
            print(f"[review] Analysing {rel} …", file=sys.stderr)

            uri = open_document(client, sysml_file)
            # First file triggers DFA warm-up (~20 s); subsequent files are fast
            timeout = 45.0 if not file_results else 15.0
            client.drain_until_diagnostics(uri, timeout=timeout)
            diags = client.get_diagnostics(uri)

            # Optional LLM review
            code = sysml_file.read_text(encoding="utf-8")
            messages = build_review_prompt(code, diags, sysml_file.name)
            llm_text = _call_llm(messages)
            if llm_text is not None and llm_text != "":
                print(f"[review]   ✓ LLM review received ({len(llm_text)} chars)", file=sys.stderr)
            elif llm_text == "":
                print("[review]   ⚠ LLM returned empty content", file=sys.stderr)
                llm_text = None
            else:
                print("[review]   ⚠ LLM returned no content (None) — check logs above", file=sys.stderr)

            file_results.append({
                "filename": str(sysml_file),
                "rel_name": str(rel),
                "diagnostics": diags,
                "llm_review": llm_text,
                "code": code,
            })

        lsp_shutdown(client)
    except Exception as exc:
        print(f"[review] ERROR: {exc}", file=sys.stderr)
        proc.kill()
        sys.exit(1)
    finally:
        proc.wait(timeout=5)

    has_llm = any(r.get("llm_review") for r in file_results)
    markdown = build_markdown_report(file_results, has_llm=has_llm, review_id=review_id)

    _write_output(args.output, markdown)

    # Optional JSON record (compatible with .review-runs/ format)
    json_path = args.json_output
    if json_path is None:
        review_runs_dir = repo_root / ".review-runs"
        review_runs_dir.mkdir(exist_ok=True)
        json_path = str(review_runs_dir / f"{review_id}.json")

    record: dict[str, Any] = {
        "id": review_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "files": [r["rel_name"] for r in file_results],
        "sourceFiles": [
            {"name": r["rel_name"], "code": r["code"]} for r in file_results
        ],
        "results": [
            {
                "filename": r["rel_name"],
                "diagnostics": r["diagnostics"],
                "llmReview": r.get("llm_review"),
            }
            for r in file_results
        ],
        "hasLlmReview": has_llm,
    }
    Path(json_path).write_text(json.dumps(record, indent=2), encoding="utf-8")
    print(f"[review] JSON record saved: {json_path}", file=sys.stderr)


def _write_output(output_arg: str, content: str) -> None:
    if output_arg == "-":
        print(content)
    else:
        Path(output_arg).write_text(content, encoding="utf-8")
        print(f"[review] Markdown report saved: {output_arg}", file=sys.stderr)


if __name__ == "__main__":
    main()
