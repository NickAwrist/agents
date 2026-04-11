import { Router, type Response } from "express";
import crypto from "crypto";
import type { HistoryWireStep } from "../session/AgentSession";
import { AgentSession } from "../session/AgentSession";
import {
  getAgentByName,
  getSessionById,
  replaceSessionMessages,
  resolveSessionAgentName,
  type WireMessage,
} from "../db/index";
import { formatPersonalizationBlock } from "../personalization";
import { DEFAULT_CHAT_MODEL } from "../constants";

const router = Router();

const activeRequests = new Map<string, AbortController>();

function writeSse(res: Response, payload: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

router.post("/abort", (req, res) => {
  const { requestId } = req.body as { requestId?: string };
  if (!requestId || !activeRequests.has(requestId)) {
    res.json({ aborted: false });
    return;
  }
  activeRequests.get(requestId)!.abort();
  activeRequests.delete(requestId);
  res.json({ aborted: true });
});

router.post("/", async (req, res) => {
  const body = req.body as {
    sessionId?: unknown;
    message?: unknown;
    history?: unknown;
    model?: unknown;
    modelMessages?: Array<Record<string, unknown>> | null;
    ephemeral?: unknown;
    agentName?: unknown;
    personalization?: unknown;
  };
  const ephemeral = body.ephemeral === true;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";

  if (!ephemeral) {
    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }
    if (!getSessionById(sessionId)) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
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

  let chatAgentName: string;
  if (ephemeral) {
    const rawAgent = typeof body.agentName === "string" ? body.agentName.trim() : "";
    chatAgentName = (rawAgent && getAgentByName(rawAgent)) ? rawAgent : resolveSessionAgentName(null);
  } else {
    const sessionRow = getSessionById(sessionId);
    chatAgentName = resolveSessionAgentName(sessionRow);
  }

  const agentRow = getAgentByName(chatAgentName);
  let personalizationBlock: string | undefined;
  if (agentRow && agentRow.include_personalization) {
    const raw = body.personalization;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      const block = formatPersonalizationBlock({
        name: typeof o.name === "string" ? o.name : "",
        location: typeof o.location === "string" ? o.location : "",
        preferredFormats: typeof o.preferredFormats === "string" ? o.preferredFormats : "",
      });
      if (block) personalizationBlock = block;
    }
  }

  const session = new AgentSession(crypto.randomUUID(), {
    model,
    agentName: chatAgentName,
    personalizationBlock,
  });
  session.restoreFromPersistence({
    history: body.history as { role: string; content: string; steps?: HistoryWireStep[] }[],
    modelMessages: body.modelMessages,
  });

  const safeSse = (payload: Record<string, unknown>) => {
    if (!clientDisconnected) writeSse(res, payload);
  };

  safeSse({ type: "chat_started", requestId });

  const persistTurn = ephemeral
    ? () => {}
    : (hist: WireMessage[], modelMessages: Array<Record<string, unknown>> | null) => {
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
    if (!ephemeral && Array.isArray(p.history)) {
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
      if (!ephemeral) persistTurn(session.history as WireMessage[], modelMessages);
      safeSse({
        type: "chat_done",
        result,
        steps: stepsSnapshot,
        modelMessages: ephemeral ? modelMessages : undefined,
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

export default router;
