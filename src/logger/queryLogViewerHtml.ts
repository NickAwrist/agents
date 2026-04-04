/**
 * Self-contained HTML viewer for query log JSON: embeds payload as base64 UTF-8, renders with vanilla JS.
 */

function b64EncodeUtf8(json: string): string {
  return Buffer.from(json, "utf8").toString("base64");
}

export function buildQueryLogViewerHtml(data: Record<string, unknown>): string {
  const payload = b64EncodeUtf8(JSON.stringify(data));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Query log</title>
  <style>
    :root {
      --bg: #ececee;
      --panel: #fafafa;
      --border: #c8c8d0;
      --text: #1a1a1f;
      --muted: #5c5c66;
      --accent: #2563eb;
      --mono: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace;
      --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--sans);
      font-size: 14px;
      line-height: 1.45;
      color: var(--text);
      background: var(--bg);
    }
    .wrap { max-width: 960px; margin: 0 auto; padding: 1.25rem 1rem 2rem; }
    h1 {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0 0 0.75rem;
      letter-spacing: 0.02em;
    }
    h2 {
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin: 1.25rem 0 0.5rem;
    }
    .meta {
      display: grid;
      gap: 0.35rem 1.5rem;
      grid-template-columns: auto 1fr;
      font-size: 0.8rem;
      color: var(--muted);
    }
    .meta dt { font-weight: 500; color: var(--text); }
    .meta dd { margin: 0; font-family: var(--mono); font-size: 0.78rem; word-break: break-all; }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      padding: 0.85rem 1rem;
      margin-bottom: 0.75rem;
    }
    .query { white-space: pre-wrap; word-break: break-word; font-size: 0.9rem; }
    .response {
      border-left: 3px solid var(--accent);
      padding-left: 0.75rem;
      margin-top: 0.25rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    details {
      border: 1px solid var(--border);
      background: #fff;
      margin-bottom: 0.5rem;
    }
    details.run-root { border-width: 2px; border-color: #94a3b8; }
    summary {
      cursor: pointer;
      list-style: none;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.35rem 0.75rem;
      padding: 0.5rem 0.65rem;
      font-weight: 600;
      font-size: 0.82rem;
      user-select: none;
      background: #f0f0f3;
    }
    summary::-webkit-details-marker { display: none; }
    summary::before {
      content: "";
      display: inline-block;
      width: 0.45em;
      height: 0.45em;
      border-right: 2px solid var(--muted);
      border-bottom: 2px solid var(--muted);
      transform: rotate(-45deg);
      margin-right: 0.15rem;
      transition: transform 0.12s ease;
    }
    details[open] > summary::before { transform: rotate(45deg); margin-top: -0.1em; }
    summary:hover { background: #e6e6ea; }
    .summary-meta { font-weight: 400; font-family: var(--mono); font-size: 0.75rem; color: var(--muted); }
    .dur {
      margin-left: auto;
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted);
      font-weight: 400;
    }
    .details-body { padding: 0.65rem 0.75rem 0.85rem; border-top: 1px solid var(--border); background: var(--panel); }
    .path-line { font-family: var(--mono); font-size: 0.72rem; color: var(--muted); margin-bottom: 0.65rem; word-break: break-all; }
    .turn {
      border-left: 2px solid var(--border);
      margin-left: 0.35rem;
      padding: 0.5rem 0 0.65rem 0.75rem;
      margin-bottom: 0.5rem;
    }
    .turn-h {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 0.35rem;
    }
    .block-label {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin: 0.5rem 0 0.25rem;
    }
    .pre {
      margin: 0;
      padding: 0.45rem 0.55rem;
      background: #fff;
      border: 1px solid var(--border);
      font-family: var(--mono);
      font-size: 0.75rem;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-x: auto;
    }
    .pre.dark { background: #1e1e24; color: #e8e8ed; border-color: #2a2a32; }
    details.tool > summary { background: #f5f5f0; }
    details.tool[open] > summary { border-bottom: 1px solid var(--border); }
    .nested-label {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin: 0.75rem 0 0.4rem;
    }
    .empty { color: var(--muted); font-size: 0.85rem; font-style: italic; }
    .err { color: #b91c1c; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="wrap" id="root"></div>
  <script>
(function () {
  var PAYLOAD = ${JSON.stringify(payload)};
  function decodeB64Utf8(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }
  function esc(s) {
    if (s == null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function durMs(start, end) {
    if (!start || !end) return "";
    var ms = new Date(end) - new Date(start);
    if (isNaN(ms)) return "";
    return (ms / 1000).toFixed(2) + "s";
  }
  function el(tag, attrs, innerHTML) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k) && attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    if (innerHTML != null) n.innerHTML = innerHTML;
    return n;
  }
  function textPre(className, content) {
    var p = el("pre", { class: "pre " + (className || "") });
    p.textContent = content == null ? "" : String(content);
    return p;
  }
  function renderTool(tool, runDepth) {
    var d = document.createElement("details");
    d.className = "tool";
    if (runDepth === 0) d.open = true;
    var name = tool.toolName != null ? String(tool.toolName) : "(tool)";
    var du = durMs(tool.startedAt, tool.endedAt);
    var sum = el("summary", null,
      esc(name) +
      (tool.path ? '<span class="summary-meta">' + esc(tool.path) + "</span>" : "") +
      (du ? '<span class="dur">' + esc(du) + "</span>" : "")
    );
    d.appendChild(sum);
    var body = el("div", { class: "details-body" });
    body.appendChild(el("div", { class: "block-label" }, "Arguments"));
    body.appendChild(textPre("dark", JSON.stringify(tool.args != null ? tool.args : {}, null, 2)));
    if (tool.result != null && tool.result !== "") {
      body.appendChild(el("div", { class: "block-label" }, "Result"));
      body.appendChild(textPre("", tool.result));
    }
    if (tool.nestedRun) {
      body.appendChild(el("div", { class: "nested-label" }, "Nested agent"));
      body.appendChild(renderAgentRun(tool.nestedRun, runDepth + 1));
    }
    d.appendChild(body);
    return d;
  }
  function renderTurn(turn, runDepth) {
    var wrap = el("div", { class: "turn" });
    wrap.appendChild(el("div", { class: "turn-h" }, "Turn " + (turn.turnIndex != null ? turn.turnIndex : "?")));
    wrap.appendChild(el("div", { class: "block-label" }, "Input"));
    wrap.appendChild(textPre("", turn.userInput || ""));
    var tools = turn.tools;
    if (tools && tools.length) {
      wrap.appendChild(el("div", { class: "block-label" }, "Tools"));
      for (var i = 0; i < tools.length; i++) wrap.appendChild(renderTool(tools[i], runDepth));
    }
    if (turn.assistantContent) {
      wrap.appendChild(el("div", { class: "block-label" }, "Assistant"));
      wrap.appendChild(textPre("", turn.assistantContent));
    }
    return wrap;
  }
  function renderAgentRun(run, depth) {
    var d = document.createElement("details");
    d.className = depth === 0 ? "run-root" : "";
    if (depth === 0) d.open = true;
    var agent = run.agentName != null ? String(run.agentName) : "Agent";
    var du = durMs(run.startedAt, run.endedAt);
    var sum = el("summary", null,
      esc(agent) +
      (run.path ? '<span class="summary-meta">' + esc(run.path) + "</span>" : "") +
      (du ? '<span class="dur">' + esc(du) + "</span>" : "")
    );
    d.appendChild(sum);
    var body = el("div", { class: "details-body" });
    if (run.path) {
      var pl = el("div", { class: "path-line" });
      pl.textContent = run.path;
      body.appendChild(pl);
    }
    var turns = run.turns;
    if (turns && turns.length) {
      body.appendChild(el("h2", null, "Trace"));
      for (var t = 0; t < turns.length; t++) body.appendChild(renderTurn(turns[t], depth));
    } else {
      body.appendChild(el("div", { class: "empty" }, "No turns recorded."));
    }
    if (run.finalText) {
      body.appendChild(el("h2", null, "Final output"));
      body.appendChild(textPre("", run.finalText));
    }
    d.appendChild(body);
    return d;
  }
  function render(data) {
    var root = document.getElementById("root");
    root.innerHTML = "";
    root.appendChild(el("h1", null, "Query log"));
    var dl = el("dl", { class: "meta" });
    function row(dt, dd) {
      dl.appendChild(el("dt", null, dt));
      var d = el("dd", null, esc(dd));
      dl.appendChild(d);
    }
    if (data.queryId) row("Query ID", data.queryId);
    if (data.sessionId) row("Session", data.sessionId);
    if (data.startTime) row("Start", data.startTime);
    if (data.endTime) row("End", data.endTime);
    var total = durMs(data.startTime, data.endTime);
    if (total) row("Duration", total);
    root.appendChild(dl);
    root.appendChild(el("h2", null, "User query"));
    var qcard = el("div", { class: "card" });
    qcard.appendChild(el("div", { class: "query" }, esc(data.userQuery || "")));
    root.appendChild(qcard);
    root.appendChild(el("h2", null, "Response"));
    var rcard = el("div", { class: "card" });
    rcard.appendChild(el("div", { class: "response" }, esc(data.response != null ? data.response : "")));
    root.appendChild(rcard);
    root.appendChild(el("h2", null, "Run"));
    if (data.rootRun) {
      root.appendChild(renderAgentRun(data.rootRun, 0));
    } else {
      root.appendChild(el("div", { class: "empty" }, "No root run."));
    }
  }
  try {
    var data = JSON.parse(decodeB64Utf8(PAYLOAD));
    render(data);
  } catch (e) {
    document.getElementById("root").innerHTML =
      '<div class="card"><p class="err">Failed to load log: ' + esc(e.message) + "</p></div>";
  }
})();
  </script>
</body>
</html>`;
}
