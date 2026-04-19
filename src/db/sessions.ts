import { agentNameExistsInDb } from "./agents/helpers";
import { getDb } from "./connection";
import { getDefaultChatAgent } from "./settings";
import type { SessionRow, SessionSummaryRow, WireMessage } from "./types";

export type { SessionRow, SessionSummaryRow, WireMessage } from "./types";

function previewFromTitleAndFirstUser(
  title: string | null,
  firstUser: string | null,
): string {
  const t = title?.trim();
  if (t) return t;
  if (firstUser?.trim()) {
    const u = firstUser.trim();
    return u.length > 40 ? `${u.slice(0, 40)}...` : u;
  }
  return "New chat";
}

export function listSessionSummaries(): SessionSummaryRow[] {
  const db = getDb();
  const sessions = db
    .query(
      "SELECT id, created_at, updated_at, title FROM sessions ORDER BY updated_at DESC",
    )
    .all() as Array<{
    id: string;
    created_at: number;
    updated_at: number;
    title: string | null;
  }>;

  const firstUserStmt = db.query(
    `SELECT content FROM messages WHERE session_id = ? AND role = 'user' ORDER BY position ASC LIMIT 1`,
  );

  return sessions.map((s) => {
    const fu = firstUserStmt.get(s.id) as { content: string } | null;
    return {
      id: s.id,
      created_at: s.created_at,
      updated_at: s.updated_at,
      preview: previewFromTitleAndFirstUser(s.title, fu?.content ?? null),
    };
  });
}

export function getSessionById(id: string): SessionRow | null {
  const row = getDb()
    .query(
      "SELECT id, created_at, updated_at, title, model, model_messages, agent_name, session_directory FROM sessions WHERE id = ?",
    )
    .get(id) as SessionRow | null;
  return row ?? null;
}

export function countMessagesForSession(sessionId: string): number {
  const row = getDb()
    .query("SELECT COUNT(*) as c FROM messages WHERE session_id = ?")
    .get(sessionId) as { c: number } | null;
  return row?.c ?? 0;
}

export function getMessagesForSession(sessionId: string): WireMessage[] {
  const rows = getDb()
    .query(
      "SELECT role, content, steps FROM messages WHERE session_id = ? ORDER BY position ASC",
    )
    .all(sessionId) as Array<{
    role: string;
    content: string;
    steps: string | null;
  }>;

  return rows.map((r) => {
    const msg: WireMessage = { role: r.role, content: r.content };
    if (r.steps != null && r.steps !== "") {
      try {
        msg.steps = JSON.parse(r.steps) as unknown;
      } catch {
        /* ignore */
      }
    }
    return msg;
  });
}

export function parseModelMessages(
  json: string | null,
): Array<Record<string, unknown>> | null {
  if (json == null || json === "") return null;
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : null;
  } catch {
    return null;
  }
}

export function resolveSessionAgentName(row: SessionRow | null): string {
  if (!row) return getDefaultChatAgent();
  const a = row.agent_name?.trim();
  if (a && agentNameExistsInDb(a)) return a;
  return getDefaultChatAgent();
}

export function createSessionRow(
  id: string,
  now: number,
  model: string | null,
  agentName?: string | null,
): SessionRow {
  const db = getDb();
  const resolvedAgent =
    typeof agentName === "string" && agentName.trim()
      ? agentName.trim()
      : getDefaultChatAgent();
  db.run(
    "INSERT INTO sessions (id, created_at, updated_at, title, model, model_messages, agent_name) VALUES (?, ?, ?, NULL, ?, NULL, ?)",
    [id, now, now, model, resolvedAgent],
  );
  return {
    id,
    created_at: now,
    updated_at: now,
    title: null,
    model,
    model_messages: null,
    agent_name: resolvedAgent,
    session_directory: null,
  };
}

export function deleteSessionRow(id: string): boolean {
  const db = getDb();
  const r = db.run("DELETE FROM sessions WHERE id = ?", [id]);
  return r.changes > 0;
}

export function patchSessionRow(
  id: string,
  patch: {
    title?: string | null;
    model?: string | null;
    model_messages?: Array<Record<string, unknown>> | null;
    agent_name?: string | null;
    session_directory?: string | null;
    updated_at?: number;
  },
): boolean {
  const existing = getSessionById(id);
  if (!existing) return false;

  const title = patch.title !== undefined ? patch.title : existing.title;
  const model = patch.model !== undefined ? patch.model : existing.model;
  const agentName =
    patch.agent_name !== undefined ? patch.agent_name : existing.agent_name;
  const sessionDirectory =
    patch.session_directory !== undefined
      ? patch.session_directory
      : existing.session_directory;
  let modelMessagesJson: string | null = existing.model_messages;
  if (patch.model_messages !== undefined) {
    modelMessagesJson =
      patch.model_messages == null
        ? null
        : JSON.stringify(patch.model_messages);
  }
  const updatedAt = patch.updated_at ?? Date.now();

  getDb().run(
    "UPDATE sessions SET title = ?, model = ?, model_messages = ?, agent_name = ?, session_directory = ?, updated_at = ? WHERE id = ?",
    [
      title,
      model,
      modelMessagesJson,
      agentName,
      sessionDirectory,
      updatedAt,
      id,
    ],
  );
  return true;
}

/**
 * Persists chat history without rewriting the full table each time: truncates when the
 * client sends a shorter history, appends new tail rows, or updates the last row when
 * the count is unchanged (e.g. assistant steps filled in).
 */
export function persistSessionMessages(
  sessionId: string,
  messages: WireMessage[],
  modelMessages: Array<Record<string, unknown>> | null,
  updatedAt: number,
  chatModel?: string | null,
): boolean {
  const row = getSessionById(sessionId);
  if (!row) return false;
  const db = getDb();
  const nextModel =
    typeof chatModel === "string" && chatModel.trim()
      ? chatModel.trim()
      : row.model;
  const tx = db.transaction(() => {
    let n = countMessagesForSession(sessionId);
    if (messages.length < n) {
      db.run("DELETE FROM messages WHERE session_id = ? AND position >= ?", [
        sessionId,
        messages.length,
      ]);
      n = countMessagesForSession(sessionId);
    }

    const insert = db.prepare(
      "INSERT INTO messages (session_id, role, content, steps, position) VALUES (?, ?, ?, ?, ?)",
    );
    for (let i = n; i < messages.length; i++) {
      const m = messages[i]!;
      const stepsJson =
        m.steps !== undefined && m.steps != null
          ? JSON.stringify(m.steps)
          : null;
      insert.run(sessionId, m.role, m.content, stepsJson, i);
    }

    if (messages.length > 0 && n === messages.length) {
      const last = messages[messages.length - 1]!;
      const stepsJson =
        last.steps !== undefined && last.steps != null
          ? JSON.stringify(last.steps)
          : null;
      db.run(
        "UPDATE messages SET content = ?, steps = ? WHERE session_id = ? AND position = ?",
        [last.content, stepsJson, sessionId, messages.length - 1],
      );
    }

    const mmJson = modelMessages == null ? null : JSON.stringify(modelMessages);
    db.run(
      "UPDATE sessions SET model_messages = ?, updated_at = ?, model = ? WHERE id = ?",
      [mmJson, updatedAt, nextModel, sessionId],
    );
  });
  tx();
  return true;
}
