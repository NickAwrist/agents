import crypto from "node:crypto";
import { type Response, Router } from "express";
import {
  resolveChatAgentName,
  resolvePersonalizationBlock,
  resolveToolSessionDirFromBody,
} from "../chat/resolveTurnContext";
import type { ActiveGeneration } from "../chat/sseStream";
import { broadcastSse, writeSse } from "../chat/sseStream";
import { DEFAULT_CHAT_MODEL } from "../constants";
import {
  type SessionRow,
  type WireMessage,
  getAgentByName,
  getSessionById,
  persistSessionMessages,
  resolveSessionAgentName,
} from "../db/index";
import { logger } from "../logger";
import type { HistoryWireStep } from "../session/AgentSession";
import { AgentSession } from "../session/AgentSession";

const router = Router();
const log = logger.child({ route: "chat" });

const activeRequests = new Map<string, AbortController>();
const activeGenerationsBySession = new Map<string, ActiveGeneration>();
const ORPHAN_TIMEOUT_MS = 5 * 60 * 1000;

function startOrphanTimer(gen: ActiveGeneration) {
  if (gen.orphanTimer) clearTimeout(gen.orphanTimer);
  gen.orphanTimer = setTimeout(() => {
    gen.abortController.abort();
  }, ORPHAN_TIMEOUT_MS);
}

function clearOrphanTimer(gen: ActiveGeneration) {
  if (gen.orphanTimer) {
    clearTimeout(gen.orphanTimer);
    gen.orphanTimer = null;
  }
}

function removeClient(gen: ActiveGeneration, res: Response) {
  gen.clients.delete(res);
  if (gen.clients.size === 0) startOrphanTimer(gen);
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

router.post("/abort-session/:sessionId", (req, res) => {
  const gen = activeGenerationsBySession.get(req.params.sessionId);
  if (!gen) {
    res.json({ aborted: false });
    return;
  }
  gen.abortController.abort();
  res.json({ aborted: true });
});

router.post("/debug-prompt", (req, res) => {
  const body = req.body as {
    sessionId?: unknown;
    ephemeral?: unknown;
    agentName?: unknown;
    personalization?: unknown;
    sessionDirectory?: unknown;
  };
  const ephemeral = body.ephemeral === true;
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";

  let persistedSession: SessionRow | null = null;
  if (!ephemeral) {
    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }
    persistedSession = getSessionById(sessionId);
    if (!persistedSession) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
  }

  const chatAgentName = resolveChatAgentName(
    ephemeral,
    body.agentName,
    persistedSession,
  );
  const toolSessionDir = resolveToolSessionDirFromBody(
    body.sessionDirectory,
    persistedSession,
  );

  const agentRow = getAgentByName(chatAgentName);
  if (!agentRow) {
    res.status(400).json({ error: `Unknown agent '${chatAgentName}'` });
    return;
  }

  const personalizationBlock = resolvePersonalizationBlock(
    agentRow,
    body.personalization,
  );

  const session = new AgentSession(crypto.randomUUID(), {
    model: DEFAULT_CHAT_MODEL,
    agentName: chatAgentName,
    personalizationBlock,
    toolSessionDir,
  });
  res.json({ systemPrompt: session.getSystemPromptForDebug() });
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
    sessionDirectory?: unknown;
  };
  const ephemeral = body.ephemeral === true;
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";

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
    res.write(":\n\n");
  }, 15000);

  const requestedModel =
    typeof body.model === "string" ? body.model.trim() : "";
  const model = requestedModel || DEFAULT_CHAT_MODEL;

  const requestId = crypto.randomUUID();
  const abortController = new AbortController();
  activeRequests.set(requestId, abortController);

  let clientDisconnected = false;

  const gen: ActiveGeneration | null = ephemeral
    ? null
    : {
        requestId,
        sessionId,
        abortController,
        eventBuffer: [],
        clients: new Set([res]),
        orphanTimer: null,
      };
  if (gen) {
    const prev = activeGenerationsBySession.get(sessionId);
    if (prev) {
      prev.abortController.abort();
      clearOrphanTimer(prev);
      for (const c of prev.clients) {
        try {
          c.end();
        } catch (err) {
          log.debug({ err }, "sse end prev client");
        }
      }
    }
    activeGenerationsBySession.set(sessionId, gen);
  }

  res.on("close", () => {
    if (!res.writableFinished) {
      clientDisconnected = true;
      if (gen) {
        removeClient(gen, res);
      } else {
        abortController.abort();
      }
    }
  });

  let persistedSession: SessionRow | null = null;
  if (!ephemeral) {
    persistedSession = getSessionById(sessionId);
  }

  const chatAgentName = resolveChatAgentName(
    ephemeral,
    body.agentName,
    persistedSession,
  );
  const toolSessionDir = resolveToolSessionDirFromBody(
    body.sessionDirectory,
    persistedSession,
  );

  const agentRow = getAgentByName(chatAgentName);
  const personalizationBlock = resolvePersonalizationBlock(
    agentRow,
    body.personalization,
  );

  const session = new AgentSession(crypto.randomUUID(), {
    model,
    agentName: chatAgentName,
    personalizationBlock,
    toolSessionDir,
  });
  session.restoreFromPersistence({
    history: body.history as {
      role: string;
      content: string;
      steps?: HistoryWireStep[];
    }[],
    modelMessages: body.modelMessages,
  });

  const safeSse = (payload: Record<string, unknown>) => {
    if (gen) {
      broadcastSse(gen, payload);
    } else if (!clientDisconnected) {
      writeSse(res, payload);
    }
  };

  if (!ephemeral) {
    const pendingHistory = [
      ...(body.history as WireMessage[]),
      { role: "user" as const, content: message },
    ];
    persistSessionMessages(
      sessionId,
      pendingHistory,
      body.modelMessages ?? null,
      Date.now(),
      model,
    );
  }

  safeSse({ type: "chat_started", requestId });

  const persistTurn = ephemeral
    ? () => {}
    : (
        hist: WireMessage[],
        modelMessages: Array<Record<string, unknown>> | null,
      ) => {
        persistSessionMessages(
          sessionId,
          hist,
          modelMessages,
          Date.now(),
          model,
        );
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
      if (!ephemeral)
        persistTurn(session.history as WireMessage[], modelMessages);
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
      log.error({ err: e }, "chat turn failed");
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
    if (gen) {
      clearOrphanTimer(gen);
      activeGenerationsBySession.delete(sessionId);
      for (const c of gen.clients) {
        try {
          c.end();
        } catch (err) {
          log.debug({ err }, "sse end client");
        }
      }
    } else if (!clientDisconnected) {
      res.end();
    }
  }
});

router.get("/active/:sessionId", (req, res) => {
  const sid = req.params.sessionId;
  const gen = activeGenerationsBySession.get(sid);
  if (!gen) {
    res.json({ active: false });
    return;
  }
  res.json({ active: true, requestId: gen.requestId });
});

router.get("/stream/:sessionId", (req, res) => {
  const sid = req.params.sessionId;
  const gen = activeGenerationsBySession.get(sid);
  if (!gen) {
    res.status(404).json({ error: "No active generation for this session" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  for (const event of gen.eventBuffer) {
    writeSse(res, event);
  }

  gen.clients.add(res);
  clearOrphanTimer(gen);

  const ping = setInterval(() => {
    res.write(":\n\n");
  }, 15000);

  res.on("close", () => {
    clearInterval(ping);
    if (!res.writableFinished) {
      removeClient(gen, res);
    }
  });
});

export default router;
