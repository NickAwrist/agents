import crypto from "node:crypto";
import type { Response } from "express";
import type { SseManager } from "./sseManager";
import type { ActiveGeneration, ChatSseEvent } from "./sseStream";

const PING_INTERVAL_MS = 15_000;

/**
 * Small handle returned from `openChatStream` — everything the turn
 * runner needs to push events, check for abort, and tear down cleanly.
 */
export type ChatStream = {
  readonly requestId: string;
  readonly signal: AbortSignal;
  emit(event: ChatSseEvent): void;
  close(): void;
};

/**
 * Sets up SSE headers, the ping interval, the abort controller, and
 * (for persistent sessions) registers a session generation so reconnecting
 * clients can resume.
 */
export function openChatStream(
  res: Response,
  sse: SseManager,
  opts: { ephemeral: boolean; sessionId: string },
): ChatStream {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const requestId = crypto.randomUUID();
  const abortController = new AbortController();
  sse.registerRequest(requestId, abortController);

  const pingInterval = setInterval(() => {
    res.write(":\n\n");
  }, PING_INTERVAL_MS);

  let clientDisconnected = false;
  const gen: ActiveGeneration | null = opts.ephemeral
    ? null
    : sse.openSessionGeneration({
        requestId,
        sessionId: opts.sessionId,
        abortController,
        initialClient: res,
      });

  res.on("close", () => {
    if (res.writableFinished) return;
    clientDisconnected = true;
    if (gen) {
      sse.removeClient(gen, res);
    } else {
      abortController.abort();
    }
  });

  return {
    requestId,
    signal: abortController.signal,
    emit(event) {
      if (gen) {
        sse.broadcast(gen, event);
      } else if (!clientDisconnected) {
        sse.sendTo(res, event);
      }
    },
    close() {
      sse.unregisterRequest(requestId);
      clearInterval(pingInterval);
      if (gen) {
        sse.closeSessionGeneration(gen);
      } else if (!clientDisconnected) {
        res.end();
      }
    },
  };
}
