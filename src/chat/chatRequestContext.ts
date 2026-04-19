import type { Response } from "express";
import { buildServerChatPromptContext } from "../agents/agentManager";
import { DEFAULT_CHAT_MODEL } from "../constants";
import { type SessionRow, getAgentByName, getSessionById } from "../db/index";
import type { PromptContext } from "../prompts/render";
import { type ChatBody, ChatBodySchema } from "../schemas/chat";
import { resolveEffectiveToolSessionDir } from "../sessionDirectory";

export type ChatTurnContext = {
  body: ChatBody;
  ephemeral: boolean;
  /** Empty string for ephemeral turns. */
  sessionId: string;
  model: string;
  agentName: string;
  toolSessionDir?: string;
  promptContext: PromptContext;
  persistedSession: SessionRow | null;
};

/**
 * Parse + validate `req.body` and resolve everything downstream needs
 * (persisted session, effective agent, tool dir, model). Writes a 4xx
 * response and returns `null` on failure so the caller can early-return.
 */
export function buildTurnContext(
  rawBody: unknown,
  res: Response,
): ChatTurnContext | null {
  const parsed = ChatBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.flatten(),
    });
    return null;
  }
  const body = parsed.data;
  const ephemeral = body.ephemeral === true;
  const sessionId = body.sessionId ?? "";

  let persistedSession: SessionRow | null = null;
  if (!ephemeral) {
    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return null;
    }
    persistedSession = getSessionById(sessionId);
    if (!persistedSession) {
      res.status(404).json({ error: "Session not found" });
      return null;
    }
  }

  const agentName = body.agentName.trim();
  if (!getAgentByName(agentName)) {
    res.status(400).json({ error: `Unknown agent: ${agentName}` });
    return null;
  }

  const toolSessionDir = resolveEffectiveToolSessionDir(
    body.sessionDirectory,
    persistedSession?.session_directory,
  );

  return {
    body,
    ephemeral,
    sessionId,
    model: body.model?.trim() || DEFAULT_CHAT_MODEL,
    agentName,
    toolSessionDir,
    promptContext: buildServerChatPromptContext({
      metadata: body.metadata,
      toolSessionDir,
    }),
    persistedSession,
  };
}
