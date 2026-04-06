import express from "express";
import cors from "cors";
import crypto from "crypto";
import type { HistoryWireStep } from "./session/AgentSession";
import { AgentSession } from "./session/AgentSession";

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

app.post("/api/chat", async (req, res) => {
  const body = req.body as {
    message?: unknown;
    history?: unknown;
    modelMessages?: Array<Record<string, unknown>>;
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

  const session = new AgentSession(crypto.randomUUID());
  session.restoreFromPersistence({
    history: body.history as { role: string; content: string; steps?: HistoryWireStep[] }[],
    modelMessages: body.modelMessages,
  });

  const onStep = (payload: unknown) => {
    writeSse(res, { type: "step", ...(payload as Record<string, unknown>) });
  };
  session.on("step", onStep);

  try {
    const result = await session.sendChat(message);
    const lastMsg = session.history[session.history.length - 1];
    const stepsSnapshot = lastMsg?.steps || [];
    writeSse(res, {
      type: "chat_done",
      result,
      steps: stepsSnapshot,
      history: session.history,
      modelMessages: session.getModelMessagesForDebug(),
      systemPrompt: session.getSystemPromptForDebug(),
    });
  } catch (e) {
    writeSse(res, {
      type: "error",
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    clearInterval(pingInterval);
    session.off("step", onStep);
    res.end();
  }
});

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Backend] API Server running on port ${PORT} across the network`);
});
