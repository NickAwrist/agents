import express from "express";
import cors from "cors";
import crypto from "crypto";
import { AgentSession } from "./session/AgentSession";

const app = express();
app.use(cors());
app.use(express.json());

// In-memory store for sessions
const sessions = new Map<string, AgentSession>();
const sessionMetas = new Map<string, { createdAt: number, updatedAt: number, preview: string }>();

app.post("/api/sessions", (req, res) => {
  const sessionId = crypto.randomUUID();
  const session = new AgentSession(sessionId);
  sessions.set(sessionId, session);
  sessionMetas.set(sessionId, { createdAt: Date.now(), updatedAt: Date.now(), preview: "New Session" });
  res.json({ sessionId });
});

app.get("/api/sessions", (req, res) => {
  const list = Array.from(sessions.keys()).map(id => {
    const meta = sessionMetas.get(id);
    const session = sessions.get(id);
    const history = session?.history || [];
    let preview = meta?.preview || "New Session";
    
    // Find first user message for a more descriptive preview
    const userMsgs = history.filter(h => h.role === "user");
    if (userMsgs.length > 0) {
       const last = userMsgs[userMsgs.length - 1]?.content || "New Session";
       preview = last.length > 40 ? last.substring(0, 40) + "..." : last;
    }
    
    return {
      id,
      createdAt: meta?.createdAt || Date.now(),
      updatedAt: meta?.updatedAt || Date.now(),
      preview
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
  res.json({
    sessionId: session.sessionId,
    history: session.history,
    systemPrompt: (session as any).generalAgent?.systemPrompt || "No system prompt accessible",
  });
});

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
