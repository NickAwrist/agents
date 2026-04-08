import express from "express";
import cors from "cors";
import crypto from "crypto";
import ollama from "ollama";
import type { HistoryWireStep } from "./session/AgentSession";
import { AgentSession } from "./session/AgentSession";

const DEFAULT_CHAT_MODEL = "gemma4:31b";

const activeRequests = new Map<string, AbortController>();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

function writeSse(res: express.Response, payload: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

app.get("/api/agent/system-prompt", (_req, res) => {
  const session = new AgentSession("meta");
  res.json({ systemPrompt: session.getSystemPromptForDebug() });
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
    message?: unknown;
    history?: unknown;
    model?: unknown;
    modelMessages?: Array<Record<string, unknown>> | null;
  };
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

  const session = new AgentSession(crypto.randomUUID(), { model });
  session.restoreFromPersistence({
    history: body.history as { role: string; content: string; steps?: HistoryWireStep[] }[],
    modelMessages: body.modelMessages,
  });

  const safeSse = (payload: Record<string, unknown>) => {
    if (!clientDisconnected) writeSse(res, payload);
  };

  safeSse({ type: "chat_started", requestId });

  const onStep = (payload: unknown) => {
    safeSse({ type: "step", ...(payload as Record<string, unknown>) });
  };
  const onStreamDelta = (payload: unknown) => {
    safeSse({ type: "stream_delta", ...(payload as Record<string, unknown>) });
  };
  const onAborted = (payload: unknown) => {
    safeSse({ type: "chat_aborted", ...(payload as Record<string, unknown>) });
  };
  session.on("step", onStep);
  session.on("stream_delta", onStreamDelta);
  session.on("aborted", onAborted);

  try {
    const result = await session.sendChat(message, abortController.signal);
    if (!abortController.signal.aborted) {
      const lastMsg = session.history[session.history.length - 1];
      const stepsSnapshot = lastMsg?.steps || [];
      safeSse({
        type: "chat_done",
        result,
        steps: stepsSnapshot,
        history: session.history,
        modelMessages: session.getModelMessagesForDebug(),
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
