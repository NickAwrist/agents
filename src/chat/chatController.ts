import type { Request, Response } from "express";
import { createChatPersistence } from "./chatPersistence";
import { buildTurnContext } from "./chatRequestContext";
import { openChatStream } from "./chatStream";
import { runChatTurn } from "./chatTurnRunner";
import type { SseManager } from "./sseManager";

/**
 * Thin orchestration layer: validate + resolve context, open an SSE
 * stream, hand those off to the turn runner, then close the stream.
 * All real work lives in the injected collaborators.
 */
export async function handleChat(
  req: Request,
  res: Response,
  sse: SseManager,
): Promise<void> {
  const ctx = buildTurnContext(req.body, res);
  if (!ctx) return;

  const stream = openChatStream(res, sse, {
    ephemeral: ctx.ephemeral,
    sessionId: ctx.sessionId,
  });
  const persistence = createChatPersistence({
    sessionId: ctx.sessionId,
    model: ctx.model,
    ephemeral: ctx.ephemeral,
  });

  try {
    await runChatTurn(ctx, stream, persistence);
  } finally {
    stream.close();
  }
}
