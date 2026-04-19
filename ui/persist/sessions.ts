import type { Message } from "../types";
import type { SessionSummary } from "../types";

export type StoredChatSession = {
  id: string;
  createdAt: number;
  updatedAt: number;
  customTitle?: string | null;
  history: Message[];
  modelMessages?: Array<Record<string, unknown>> | null;
  model?: string | null;
  sessionDirectory?: string | null;
};

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    if (typeof j.error === "string") return j.error;
  } catch {
    /* ignore */
  }
  return res.statusText || `HTTP ${res.status}`;
}

export async function fetchSessionSummaries(): Promise<SessionSummary[]> {
  const res = await fetch("/api/sessions");
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { sessions?: unknown };
  const raw = Array.isArray(data.sessions) ? data.sessions : [];
  return raw
    .filter((s): s is Record<string, unknown> => s != null && typeof s === "object")
    .map((s) => ({
      id: String(s.id ?? ""),
      createdAt: Number(s.createdAt) || 0,
      updatedAt: Number(s.updatedAt) || 0,
      preview: String(s.preview ?? "New chat"),
    }))
    .filter((s) => s.id.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function fetchSession(id: string): Promise<StoredChatSession | null> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res));
  const s = (await res.json()) as Record<string, unknown>;
  return {
    id: String(s.id ?? ""),
    createdAt: Number(s.createdAt) || 0,
    updatedAt: Number(s.updatedAt) || 0,
    customTitle: s.customTitle == null ? null : String(s.customTitle),
    history: Array.isArray(s.history) ? (s.history as Message[]) : [],
    modelMessages:
      s.modelMessages === null || s.modelMessages === undefined
        ? null
        : Array.isArray(s.modelMessages)
          ? (s.modelMessages as Array<Record<string, unknown>>)
          : null,
    model: s.model == null ? null : String(s.model),
    sessionDirectory:
      s.sessionDirectory === null || s.sessionDirectory === undefined
        ? null
        : String(s.sessionDirectory),
  };
}

export async function createSessionApi(opts?: {
  model?: string | null;
}): Promise<{
  id: string;
  createdAt: number;
  updatedAt: number;
}> {
  const body: Record<string, string> = {};
  if (opts?.model?.trim()) body.model = opts.model.trim();
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  const j = (await res.json()) as Record<string, unknown>;
  return {
    id: String(j.id ?? ""),
    createdAt: Number(j.createdAt) || Date.now(),
    updatedAt: Number(j.updatedAt) || Date.now(),
  };
}

export async function patchSessionApi(
  id: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function deleteSessionApi(id: string): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) throw new Error(await readError(res));
}
