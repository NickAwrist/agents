import {
  type SessionRow,
  getAgentByName,
  resolveSessionAgentName,
} from "../db/index";
import { formatPersonalizationBlock } from "../personalization";
import { resolveEffectiveToolSessionDir } from "../sessionDirectory";

export function resolveChatAgentName(
  ephemeral: boolean,
  bodyAgentName: unknown,
  persistedSession: SessionRow | null,
): string {
  if (ephemeral) {
    const rawAgent =
      typeof bodyAgentName === "string" ? bodyAgentName.trim() : "";
    return rawAgent && getAgentByName(rawAgent)
      ? rawAgent
      : resolveSessionAgentName(null);
  }
  return resolveSessionAgentName(persistedSession);
}

export function resolveToolSessionDirFromBody(
  bodySessionDirectory: unknown,
  persistedSession: SessionRow | null,
): string {
  return resolveEffectiveToolSessionDir(
    bodySessionDirectory,
    persistedSession?.session_directory,
  );
}

export function resolvePersonalizationBlock(
  agentRow: { include_personalization: number } | null,
  personalizationRaw: unknown,
): string | undefined {
  if (!agentRow?.include_personalization) return undefined;
  const raw = personalizationRaw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const block = formatPersonalizationBlock({
    name: typeof o.name === "string" ? o.name : "",
    location: typeof o.location === "string" ? o.location : "",
    preferredFormats:
      typeof o.preferredFormats === "string" ? o.preferredFormats : "",
  });
  return block || undefined;
}
