import crypto from "node:crypto";
import type { WireMessage } from "../db/index";
import { logger } from "../logger";
import {
  AgentSession,
  type HistoryWireStep,
  type SessionAbortedEvent,
  type SessionMessage,
  type SessionStepEvent,
  type SessionStreamDeltaEvent,
} from "../session/AgentSession";
import type { ChatPersistence } from "./chatPersistence";
import type { ChatTurnContext } from "./chatRequestContext";
import type { ChatStream } from "./chatStream";

const log = logger.child({ component: "chatTurnRunner" });

/**
 * Run one agent turn end-to-end: bootstrap the session from the request
 * body, pipe its lifecycle events to the SSE stream, and persist at the
 * documented boundaries. All I/O dependencies are injected so this file
 * contains no Express, no DB, no SSE internals.
 */
export async function runChatTurn(
  ctx: ChatTurnContext,
  stream: ChatStream,
  persistence: ChatPersistence,
): Promise<void> {
  const session = buildSession(ctx);

  const onStep = (p: SessionStepEvent) =>
    stream.emit({ type: "step", step: p.step, steps: p.steps });

  const onStreamDelta = (p: SessionStreamDeltaEvent) =>
    stream.emit({
      type: "stream_delta",
      contentDelta: p.contentDelta,
      thinkingDelta: p.thinkingDelta,
      agentName: p.agentName,
    });

  const onAborted = (p: SessionAbortedEvent) => {
    persistence.saveFinal(p.history as WireMessage[], p.modelMessages);
    stream.emit({
      type: "chat_aborted",
      result: p.result,
      steps: p.steps,
      history: p.history,
      modelMessages: p.modelMessages,
    });
  };

  session.on("step", onStep);
  session.on("stream_delta", onStreamDelta);
  session.on("aborted", onAborted);

  persistence.saveInitial(
    ctx.body.history as WireMessage[],
    ctx.body.message,
    ctx.body.modelMessages ?? null,
  );
  stream.emit({ type: "chat_started", requestId: stream.requestId });

  try {
    const result = await session.sendChat(ctx.body.message, stream.signal);
    if (stream.signal.aborted) return;
    const stepsSnapshot =
      (session.history[session.history.length - 1]?.steps as
        | HistoryWireStep[]
        | undefined) ?? [];
    const modelMessages = session.getModelMessages();
    persistence.saveFinal(session.history as WireMessage[], modelMessages);
    stream.emit({
      type: "chat_done",
      result,
      steps: stepsSnapshot,
      ...(ctx.ephemeral ? { modelMessages } : {}),
    });
  } catch (err) {
    if (stream.signal.aborted) return;
    log.error({ err }, "chat turn failed");
    stream.emit({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    session.off("step", onStep);
    session.off("stream_delta", onStreamDelta);
    session.off("aborted", onAborted);
  }
}

function buildSession(ctx: ChatTurnContext): AgentSession {
  const session = new AgentSession(crypto.randomUUID(), {
    model: ctx.model,
    agentName: ctx.agentName,
    promptContext: ctx.promptContext,
    toolSessionDir: ctx.toolSessionDir,
  });
  session.restoreFromPersistence({
    history: ctx.body.history as SessionMessage[],
    modelMessages: ctx.body.modelMessages ?? null,
  });
  return session;
}
