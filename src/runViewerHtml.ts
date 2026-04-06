/**
 * Self-contained HTML viewer for RunContext snapshots.
 * Embeds the JSON payload as base64, renders with vanilla JS.
 */

function b64EncodeUtf8(json: string): string {
  return Buffer.from(json, "utf8").toString("base64");
}

export function buildRunViewerHtml(snapshot: Record<string, unknown>): string {
  const payload = b64EncodeUtf8(JSON.stringify(snapshot));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Run</title>
  <style>
    :root {
      --bg: #0b0c0f;
      --panel: #14161a;
      --panel-strong: #191c21;
      --panel-muted: #111317;
      --border: #2b2f36;
      --text: #eceff3;
      --muted: #98a1ad;
      --accent: #dce3eb;
      --accent-soft: #dce3eb14;
      --red: #f38b8b;
      --orange: #e7bc7a;
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
      background:
        radial-gradient(circle at top, rgba(255, 255, 255, 0.035), transparent 30%),
        linear-gradient(180deg, #101114 0%, var(--bg) 34%, #08090b 100%);
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
    .prompt { white-space: pre-wrap; word-break: break-word; font-size: 0.9rem; }
    details {
      border: 1px solid var(--border);
      background: var(--panel-muted);
      margin-bottom: 0.5rem;
    }
    details.run-root { border-width: 2px; border-color: #434852; }
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
      background: var(--panel-strong);
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
    summary:hover { background: #22252b; }
    .summary-meta { font-weight: 400; font-family: var(--mono); font-size: 0.75rem; color: var(--muted); }
    .badge {
      display: inline-block;
      padding: 0.1em 0.45em;
      border-radius: 3px;
      font-size: 0.68rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .badge-done { background: var(--accent-soft); color: var(--accent); }
    .badge-running { background: #e7bc7a1c; color: var(--orange); }
    .badge-error { background: #f38b8b1c; color: #f6b0b0; }
    .dur {
      margin-left: auto;
      font-family: var(--mono);
      font-size: 0.72rem;
      color: var(--muted);
      font-weight: 400;
    }
    .details-body { padding: 0.65rem 0.75rem 0.85rem; border-top: 1px solid var(--border); background: var(--panel); }
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
      background: #111317;
      border: 1px solid var(--border);
      font-family: var(--mono);
      font-size: 0.75rem;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-x: auto;
    }
    .pre.dark { background: #0d0f13; color: #ebeff5; border-color: #20242a; }
    .pre.thinking { background: #171a20; color: #cfd8e4; border-color: #343941; font-style: italic; }
    .step { margin-bottom: 0.5rem; }
    .step > summary { background: #191c21; }
    .step[open] > summary { border-bottom: 1px solid var(--border); }
    .nested-label {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin: 0.75rem 0 0.4rem;
    }
    .empty { color: var(--muted); font-size: 0.85rem; font-style: italic; }
    .err { color: var(--red); font-size: 0.85rem; }
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
    if (ms < 1000) return ms + "ms";
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
  function badgeClass(status) {
    if (status === "done") return "badge badge-done";
    if (status === "error") return "badge badge-error";
    return "badge badge-running";
  }
  function stepLabel(step) {
    if (step.kind === "llm_call") return "LLM Call";
    if (step.kind === "tool_call") return step.toolName || "Tool Call";
    if (step.kind === "complete") return "Complete";
    if (step.kind === "error") return "Error";
    return step.kind;
  }

  function renderStep(step) {
    var d = document.createElement("details");
    d.className = "step";
    d.open = step.kind === "error" || !!step.childRun;
    var du = durMs(step.startedAt, step.endedAt);
    var sum = el("summary", null,
      esc(stepLabel(step)) +
      ' <span class="' + badgeClass(step.status) + '">' + esc(step.status) + "</span>" +
      ' <span class="summary-meta">turn ' + step.turnIndex + "</span>" +
      (du ? '<span class="dur">' + esc(du) + "</span>" : "")
    );
    d.appendChild(sum);
    var body = el("div", { class: "details-body" });
    if (step.args && Object.keys(step.args).length > 0) {
      body.appendChild(el("div", { class: "block-label" }, "Arguments"));
      body.appendChild(textPre("dark", JSON.stringify(step.args, null, 2)));
    }
    if (step.thinking != null && step.thinking !== "") {
      body.appendChild(el("div", { class: "block-label" }, "Thinking"));
      body.appendChild(textPre("thinking", step.thinking));
    }
    if (step.result != null && step.result !== "") {
      body.appendChild(el("div", { class: "block-label" }, "Result"));
      body.appendChild(textPre("", step.result));
    }
    if (step.error != null) {
      body.appendChild(el("div", { class: "block-label" }, "Error"));
      body.appendChild(el("div", { class: "err" }, esc(step.error)));
    }
    if (step.childRun) {
      body.appendChild(el("div", { class: "nested-label" }, "Nested Agent"));
      body.appendChild(renderRun(step.childRun, 1));
    }
    d.appendChild(body);
    return d;
  }

  function renderRun(run, depth) {
    var d = document.createElement("details");
    d.className = depth === 0 ? "run-root" : "";
    d.open = true;
    var agent = run.agentName || "Agent";
    var steps = run.steps || [];
    var firstStart = steps.length ? steps[0].startedAt : null;
    var lastEnd = steps.length ? steps[steps.length - 1].endedAt : null;
    var du = durMs(firstStart, lastEnd);
    var sum = el("summary", null,
      esc(agent) +
      (du ? '<span class="dur">' + esc(du) + "</span>" : "")
    );
    d.appendChild(sum);
    var body = el("div", { class: "details-body" });
    if (run.prompt) {
      body.appendChild(el("div", { class: "block-label" }, "Prompt"));
      body.appendChild(textPre("", run.prompt));
    }
    if (steps.length) {
      body.appendChild(el("h2", null, "Steps"));
      for (var i = 0; i < steps.length; i++) body.appendChild(renderStep(steps[i]));
    } else {
      body.appendChild(el("div", { class: "empty" }, "No steps recorded."));
    }
    d.appendChild(body);
    return d;
  }

  function render(data) {
    var root = document.getElementById("root");
    root.innerHTML = "";
    root.appendChild(el("h1", null, "Agent Run"));
    var dl = el("dl", { class: "meta" });
    function row(dt, dd) {
      dl.appendChild(el("dt", null, dt));
      dl.appendChild(el("dd", null, esc(dd)));
    }
    if (data.agentName) row("Agent", data.agentName);
    var steps = data.steps || [];
    if (steps.length) {
      row("Steps", String(steps.length));
      var total = durMs(steps[0].startedAt, steps[steps.length - 1].endedAt);
      if (total) row("Duration", total);
    }
    root.appendChild(dl);
    root.appendChild(el("h2", null, "Prompt"));
    var pcard = el("div", { class: "card" });
    pcard.appendChild(el("div", { class: "prompt" }, esc(data.prompt || "")));
    root.appendChild(pcard);
    // Find the final "complete" step result as the response
    var finalResult = "";
    for (var i = steps.length - 1; i >= 0; i--) {
      if (steps[i].kind === "complete" && steps[i].result) {
        finalResult = steps[i].result;
        break;
      }
    }
    if (finalResult) {
      root.appendChild(el("h2", null, "Response"));
      var rcard = el("div", { class: "card" });
      var resp = el("div", { style: "border-left: 3px solid var(--accent); padding-left: 0.75rem; white-space: pre-wrap; word-break: break-word;" });
      resp.textContent = finalResult;
      rcard.appendChild(resp);
      root.appendChild(rcard);
    }
    root.appendChild(el("h2", null, "Run"));
    root.appendChild(renderRun(data, 0));
  }
  try {
    var data = JSON.parse(decodeB64Utf8(PAYLOAD));
    render(data);
  } catch (e) {
    document.getElementById("root").innerHTML =
      '<div class="card"><p class="err">Failed to load: ' + esc(e.message) + "</p></div>";
  }
})();
  </script>
</body>
</html>`;
}
