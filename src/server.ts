import express, { type Request, type Response } from "express";
import cors from "cors";
import crypto from "crypto";
import type { Step } from "./RunContext";
import { AgentSession } from "./session/AgentSession";

const app = express();
app.use(cors());
app.use(express.json());

// In-memory store for sessions
const sessions = new Map<string, AgentSession>();
type SessionMeta = {
  createdAt: number;
  updatedAt: number;
  preview: string;
  /** When set, sidebar/list shows this instead of the last user message. */
  customTitle?: string | null;
};

const sessionMetas = new Map<string, SessionMeta>();

function previewForSession(id: string, session: AgentSession | undefined, meta: SessionMeta | undefined): string {
  const title = meta?.customTitle?.trim();
  if (title) return title;
  const history = session?.history || [];
  const userMsgs = history.filter((h) => h.role === "user");
  if (userMsgs.length > 0) {
    const last = userMsgs[userMsgs.length - 1]?.content || "New chat";
    return last.length > 40 ? last.substring(0, 40) + "..." : last;
  }
  return "New chat";
}

app.post("/api/sessions", (req, res) => {
  const sessionId = crypto.randomUUID();
  const session = new AgentSession(sessionId);
  sessions.set(sessionId, session);
  sessionMetas.set(sessionId, { createdAt: Date.now(), updatedAt: Date.now(), preview: "New chat" });
  res.json({ sessionId });
});

app.get("/api/sessions", (req, res) => {
  const list = Array.from(sessions.keys()).map((id) => {
    const meta = sessionMetas.get(id);
    const session = sessions.get(id);
    return {
      id,
      createdAt: meta?.createdAt || Date.now(),
      updatedAt: meta?.updatedAt || Date.now(),
      preview: previewForSession(id, session, meta),
    };
  }).sort((a, b) => b.updatedAt - a.updatedAt);
  
  res.json({ sessions: list });
});

app.get("/api/sessions/:id", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const meta = sessionMetas.get(req.params.id);
  res.json({
    sessionId: session.sessionId,
    history: session.history,
    customTitle: meta?.customTitle ?? null,
    systemPrompt: session.getSystemPromptForDebug(),
    modelMessages: session.getModelMessagesForDebug(),
  });
});

/** Restore or replace a session from the client (e.g. localStorage) after the in-memory store was cleared. */
app.post("/api/sessions/restore", (req, res) => {
  const body = req.body as {
    sessionId?: string;
    history?: unknown;
    modelMessages?: Array<Record<string, unknown>>;
    createdAt?: number;
    updatedAt?: number;
    customTitle?: string | null;
  };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId || !Array.isArray(body.history)) {
    res.status(400).json({ error: "sessionId and history[] required" });
    return;
  }
  let session = sessions.get(sessionId);
  if (!session) {
    session = new AgentSession(sessionId);
    sessions.set(sessionId, session);
    sessionMetas.set(sessionId, {
      createdAt: typeof body.createdAt === "number" ? body.createdAt : Date.now(),
      updatedAt: typeof body.updatedAt === "number" ? body.updatedAt : Date.now(),
      preview: "New chat",
      customTitle: body.customTitle === undefined ? null : body.customTitle,
    });
  } else {
    const meta = sessionMetas.get(sessionId);
    if (meta) {
      if (body.customTitle !== undefined) meta.customTitle = body.customTitle;
      if (typeof body.updatedAt === "number") meta.updatedAt = body.updatedAt;
      sessionMetas.set(sessionId, meta);
    }
  }
  session.restoreFromPersistence({
    history: body.history as { role: string; content: string; steps?: Step[] }[],
    modelMessages: body.modelMessages,
  });
  res.json({ ok: true });
});

app.patch("/api/sessions/:id", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const raw = req.body?.displayTitle;
  const meta = sessionMetas.get(req.params.id);
  if (!meta) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (raw === null || raw === undefined) {
    meta.customTitle = null;
  } else if (typeof raw === "string") {
    const t = raw.trim();
    meta.customTitle = t.length > 0 ? t : null;
  } else {
    res.status(400).json({ error: "displayTitle must be a string or null" });
    return;
  }
  meta.updatedAt = Date.now();
  sessionMetas.set(req.params.id, meta);
  res.json({
    ok: true,
    preview: previewForSession(req.params.id, session, meta),
  });
});

function deleteSessionById(req: Request, res: Response) {
  const id = typeof req.params.id === "string" ? req.params.id : req.params.id?.[0];
  if (!id) {
    res.status(400).json({ error: "Missing session id" });
    return;
  }
  if (!sessions.has(id)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  sessions.delete(id);
  sessionMetas.delete(id);
  res.json({ ok: true });
}

app.delete("/api/sessions/:id", deleteSessionById);
/** POST alias: some dev proxies / clients mishandle DELETE; same behavior as DELETE. */
app.post("/api/sessions/:id/delete", deleteSessionById);

app.get("/api/sessions/:id/stream", (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const pingInterval = setInterval(() => {
    res.write(`:\n\n`); // Keep-alive ping
  }, 15000);

  const onStep = (payload: any) => {
    res.write(`data: ${JSON.stringify({ type: "step", ...payload })}\n\n`);
  };

  const onChatDone = (data: any) => {
    res.write(`data: ${JSON.stringify({ type: "chat_done", ...data })}\n\n`);
  };

  session.on("step", onStep);
  session.on("chat_done", onChatDone);

  req.on("close", () => {
    clearInterval(pingInterval);
    session.off("step", onStep);
    session.off("chat_done", onChatDone);
  });
});

app.post("/api/sessions/:id/chat", async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const { message } = req.body;
  if (!message) {
    res.status(400).json({ error: "Missing message" });
    return;
  }

  const meta = sessionMetas.get(req.params.id);
  if (meta) {
    meta.updatedAt = Date.now();
    sessionMetas.set(req.params.id, meta);
  }

  // We don't await this directly in the response so the stream gets events first,
  // but since we want to know when it finishes, we can just run it.
  try {
    const result = await session.sendChat(message);
    
    // Get the final context steps for the last assistant response
    const lastMsg = session.history[session.history.length - 1];
    const stepsSnapshot = lastMsg?.steps || [];

    // Optionally notify the stream it's fully done with this chat turn
    // We send a custom event type manually or just let the client rely on the response.
    // It's cleaner to push a special stream event so the UI knows it's complete without polling.
    // However, the standard HTTP response body will also contain the result.
    
    res.json({ result, steps: stepsSnapshot });

    // Send a stream signal to the SSE to update the UI
    // We can't easily emit it on the session since we already attached the response to history.
    // Actually we COULD emit a custom event. Let's do it manually on the response stream if needed?
    // Wait, the stream might read `chat_done` !
    const finalEvent = `data: ${JSON.stringify({ type: "chat_done", result, steps: stepsSnapshot })}\n\n`;
    // To send it we'd have to emit it from the session so all streams get it.
    session.emit("chat_done", { result, steps: stepsSnapshot }); // Wait, `onStep` doesn't handle `chat_done`. We should add a listener!
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Backend] API Server running on port ${PORT} across the network`);
});
