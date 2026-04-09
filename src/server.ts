import express from "express";
import cors from "cors";
import crypto from "crypto";
import ollama from "ollama";
import type { HistoryWireStep } from "./session/AgentSession";
import { AgentSession } from "./session/AgentSession";
import {
  createSessionRow,
  deleteSessionRow,
  getAgentByName,
  getMessagesForSession,
  getSessionById,
  getDb,
  listSessionSummaries,
  parseModelMessages,
  patchSessionRow,
  replaceSessionMessages,
  resolveSessionAgentName,
  type WireMessage,
} from "./db/index";
import agentRoutes from "./routes/agents";

const DEFAULT_CHAT_MODEL = "gemma4:31b";

getDb();

const activeRequests = new Map<string, AbortController>();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(agentRoutes);

function writeSse(res: express.Response, payload: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

app.get("/api/agent/system-prompt", (req, res) => {
  const q = typeof req.query.agentName === "string" ? req.query.agentName.trim() : "";
  const sid = typeof req.query.sessionId === "string" ? req.query.sessionId.trim() : "";
  let agentName = resolveSessionAgentName(sid ? getSessionById(sid) : null);
  if (q && getAgentByName(q)) {
    agentName = q;
  }
  try {
    const session = new AgentSession("meta", { agentName });
    res.json({ systemPrompt: session.getSystemPromptForDebug() });
  } catch {
    const session = new AgentSession("meta", { agentName: resolveSessionAgentName(null) });
    res.json({ systemPrompt: session.getSystemPromptForDebug() });
  }
});

app.get("/api/ollama/health", async (_req, res) => {
  try {
    await ollama.list();
    res.json({ connected: true });
  } catch (e) {
    res.json({
      connected: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

app.get("/api/models", async (_req, res) => {
  try {
    const { models } = await ollama.list();
    res.json({
      defaultModel: DEFAULT_CHAT_MODEL,
      models: models.map((m) => ({
        name: m.name,
        size: m.size,
        modified_at: m.modified_at instanceof Date ? m.modified_at.toISOString() : String(m.modified_at),
        digest: m.digest,
        details: m.details,
      })),
    });
  } catch (e) {
    res.status(502).json({
      error: e instanceof Error ? e.message : String(e),
      defaultModel: DEFAULT_CHAT_MODEL,
      models: [],
    });
  }
});

// --- Sessions (SQLite) ---

app.get("/api/sessions", (_req, res) => {
  const rows = listSessionSummaries();
  res.json({
    sessions: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      preview: r.preview,
    })),
  });
});

app.get("/api/sessions/:id", (req, res) => {
  const id = req.params.id;
  const row = getSessionById(id);
  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const history = getMessagesForSession(id);
  res.json({
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customTitle: row.title,
    history,
    modelMessages: parseModelMessages(row.model_messages),
    model: row.model,
    agentName: resolveSessionAgentName(row),
  });
});

app.post("/api/sessions", (req, res) => {
  const body = req.body as { model?: unknown; agentName?: unknown };
  const id = crypto.randomUUID();
  const now = Date.now();
  const model =
    typeof body.model === "string" && body.model.trim() ? body.model.trim() : null;
  const rawAgent =
    typeof body.agentName === "string" && body.agentName.trim() ? body.agentName.trim() : null;
  const agentName =
    rawAgent && getAgentByName(rawAgent) ? rawAgent : null;
  createSessionRow(id, now, model, agentName);
  res.status(201).json({ id, createdAt: now, updatedAt: now });
});

app.patch("/api/sessions/:id", (req, res) => {
  const id = req.params.id;
  const row = getSessionById(id);
  if (!row) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const body = req.body as {
    customTitle?: unknown;
    model?: unknown;
    modelMessages?: unknown;
    history?: unknown;
    agentName?: unknown;
  };
  const now = Date.now();

  if (Array.isArray(body.history)) {
    const hist = body.history as WireMessage[];
    const mm =
      "modelMessages" in body
        ? body.modelMessages === null || body.modelMessages === undefined
          ? null
          : Array.isArray(body.modelMessages)
            ? (body.modelMessages as Array<Record<string, unknown>>)
            : parseModelMessages(row.model_messages)
        : parseModelMessages(row.model_messages);
    const chatModel =
      typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
    replaceSessionMessages(id, hist, mm, now, chatModel);
  }

  const patch: Parameters<typeof patchSessionRow>[1] = { updated_at: now };
  if ("customTitle" in body) {
    const t = body.customTitle;
    patch.title =
      t === null || t === undefined
        ? null
        : typeof t === "string"
          ? t.trim() || null
          : null;
  }
  if ("model" in body && body.model !== undefined && !Array.isArray(body.history)) {
    const m = body.model;
    patch.model = m === null ? null : typeof m === "string" ? m.trim() || null : null;
  }
  if ("modelMessages" in body && !Array.isArray(body.history)) {
    const mm = body.modelMessages;
    patch.model_messages =
      mm === null || mm === undefined
        ? null
        : Array.isArray(mm)
          ? (mm as Array<Record<string, unknown>>)
          : null;
  }
  if ("agentName" in body && body.agentName !== undefined && !Array.isArray(body.history)) {
    const a = body.agentName;
    if (a === null) {
      patch.agent_name = null;
    } else if (typeof a === "string" && a.trim()) {
      const t = a.trim();
      if (!getAgentByName(t)) {
        res.status(400).json({ error: "Unknown agent" });
        return;
      }
      patch.agent_name = t;
    }
  }
  patchSessionRow(id, patch);
  res.json({ ok: true });
});

app.delete("/api/sessions/:id", (req, res) => {
  const ok = deleteSessionRow(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ ok: true });
});

app.post("/api/chat/abort", (req, res) => {
  const { requestId } = req.body as { requestId?: string };
  if (!requestId || !activeRequests.has(requestId)) {
    res.json({ aborted: false });
    return;
  }
  activeRequests.get(requestId)!.abort();
  activeRequests.delete(requestId);
  res.json({ aborted: true });
});

app.post("/api/chat", async (req, res) => {
  const body = req.body as {
    sessionId?: unknown;
    message?: unknown;
    history?: unknown;
    model?: unknown;
    modelMessages?: Array<Record<string, unknown>> | null;
  };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) {
    res.status(400).json({ error: "sessionId required" });
    return;
  }
  if (!getSessionById(sessionId)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "Missing message" });
    return;
  }
  if (!Array.isArray(body.history)) {
    res.status(400).json({ error: "history[] required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const pingInterval = setInterval(() => {
    res.write(`:\n\n`);
  }, 15000);

  const requestedModel = typeof body.model === "string" ? body.model.trim() : "";
  const model = requestedModel || DEFAULT_CHAT_MODEL;

  const requestId = crypto.randomUUID();
  const abortController = new AbortController();
  activeRequests.set(requestId, abortController);

  let clientDisconnected = false;
  res.on("close", () => {
    if (!res.writableFinished) {
      clientDisconnected = true;
      abortController.abort();
    }
  });

  const sessionRow = getSessionById(sessionId);
  const chatAgentName = resolveSessionAgentName(sessionRow);
  const session = new AgentSession(crypto.randomUUID(), { model, agentName: chatAgentName });
  session.restoreFromPersistence({
    history: body.history as { role: string; content: string; steps?: HistoryWireStep[] }[],
    modelMessages: body.modelMessages,
  });

  const safeSse = (payload: Record<string, unknown>) => {
    if (!clientDisconnected) writeSse(res, payload);
  };

  safeSse({ type: "chat_started", requestId });

  const persistTurn = (hist: WireMessage[], modelMessages: Array<Record<string, unknown>> | null) => {
    replaceSessionMessages(sessionId, hist, modelMessages, Date.now(), model);
  };

  const onStep = (payload: unknown) => {
    safeSse({ type: "step", ...(payload as Record<string, unknown>) });
  };
  const onStreamDelta = (payload: unknown) => {
    safeSse({ type: "stream_delta", ...(payload as Record<string, unknown>) });
  };
  const onAborted = (payload: unknown) => {
    const p = payload as {
      history?: WireMessage[];
      modelMessages?: Array<Record<string, unknown>> | null;
    };
    if (Array.isArray(p.history)) {
      persistTurn(p.history, p.modelMessages ?? null);
    }
    safeSse({
      type: "chat_aborted",
      ...(payload as Record<string, unknown>),
    });
  };
  session.on("step", onStep);
  session.on("stream_delta", onStreamDelta);
  session.on("aborted", onAborted);

  try {
    const result = await session.sendChat(message, abortController.signal);
    if (!abortController.signal.aborted) {
      const lastMsg = session.history[session.history.length - 1];
      const stepsSnapshot = lastMsg?.steps || [];
      const modelMessages = session.getModelMessagesForDebug();
      persistTurn(session.history as WireMessage[], modelMessages);
      safeSse({
        type: "chat_done",
        result,
        steps: stepsSnapshot,
        systemPrompt: session.getSystemPromptForDebug(),
      });
    }
  } catch (e) {
    if (!abortController.signal.aborted) {
      safeSse({
        type: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  } finally {
    activeRequests.delete(requestId);
    clearInterval(pingInterval);
    session.off("step", onStep);
    session.off("stream_delta", onStreamDelta);
    session.off("aborted", onAborted);
    if (!clientDisconnected) res.end();
  }
});

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Backend] API Server running on port ${PORT} across the network`);
});
