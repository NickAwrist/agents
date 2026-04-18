import type { Response } from "express";
import { logger } from "../logger";

export type ActiveGeneration = {
  requestId: string;
  sessionId: string;
  abortController: AbortController;
  eventBuffer: Array<Record<string, unknown>>;
  clients: Set<Response>;
  orphanTimer: ReturnType<typeof setTimeout> | null;
};

export function writeSse(
  res: Response,
  payload: Record<string, unknown>,
): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function broadcastSse(
  gen: ActiveGeneration,
  payload: Record<string, unknown>,
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
