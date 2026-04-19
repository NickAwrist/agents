import type { Response } from "express";
import { logger } from "../logger";
import type { HistoryWireStep } from "../session/AgentSession";

export type ChatSseEvent =
  | { type: "chat_started"; requestId: string }
  | {
      type: "stream_delta";
      contentDelta: string;
      thinkingDelta: string;
      agentName: string;
    }
  | {
      type: "step";
      step: Record<string, unknown>;
      steps: Record<string, unknown>[];
    }
  | {
      type: "chat_done";
      result: string;
      steps: HistoryWireStep[];
      modelMessages?: Array<Record<string, unknown>>;
    }
  | {
      type: "chat_aborted";
      result: string;
      steps: HistoryWireStep[];
      history: Array<{
        role: string;
        content: string;
        steps?: HistoryWireStep[];
      }>;
      modelMessages: Array<Record<string, unknown>> | null;
    }
  | { type: "error"; error: string };

export type ActiveGeneration = {
  requestId: string;
  sessionId: string;
  abortController: AbortController;
  eventBuffer: ChatSseEvent[];
  clients: Set<Response>;
  orphanTimer: ReturnType<typeof setTimeout> | null;
};

export function writeSse(res: Response, payload: ChatSseEvent): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function broadcastSse(
  gen: ActiveGeneration,
  payload: ChatSseEvent,
): void {
  gen.eventBuffer.push(payload);
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of gen.clients) {
    try {
      client.write(data);
    } catch (err) {
      logger.debug({ err }, "sse client gone");
    }
  }
}
