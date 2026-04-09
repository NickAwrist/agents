import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const DB_PATH = join(process.cwd(), "data", "agents.db");

export type WireMessage = {
  role: string;
  content: string;
  steps?: unknown;
};

export type SessionRow = {
  id: string;
  created_at: number;
  updated_at: number;
  title: string | null;
  model: string | null;
  model_messages: string | null;
};

let dbSingleton: Database | null = null;

export function getDb(): Database {
  if (dbSingleton) return dbSingleton;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.run("PRAGMA foreign_keys = ON;");
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      title TEXT,
      model TEXT,
      model_messages TEXT
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      steps TEXT,
      position INTEGER NOT NULL
    );
  `);
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_messages_session_position ON messages(session_id, position);",
  );
  dbSingleton = db;
  return db;
}

export type SessionSummaryRow = {
  id: string;
  created_at: number;
  updated_at: number;
  preview: string;
};

function previewFromTitleAndFirstUser(title: string | null, firstUser: string | null): string {
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
      `SELECT id, created_at, updated_at, title FROM sessions ORDER BY updated_at DESC`,
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
      `SELECT id, created_at, updated_at, title, model, model_messages FROM sessions WHERE id = ?`,
    )
    .get(id) as SessionRow | null;
  return row ?? null;
}

export function getMessagesForSession(sessionId: string): WireMessage[] {
  const rows = getDb()
    .query(
      `SELECT role, content, steps FROM messages WHERE session_id = ? ORDER BY position ASC`,
    )
    .all(sessionId) as Array<{ role: string; content: string; steps: string | null }>;

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

export function parseModelMessages(json: string | null): Array<Record<string, unknown>> | null {
  if (json == null || json === "") return null;
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : null;
  } catch {
    return null;
  }
}

export function createSessionRow(id: string, now: number, model: string | null): SessionRow {
  const db = getDb();
  db.run(
    `INSERT INTO sessions (id, created_at, updated_at, title, model, model_messages) VALUES (?, ?, ?, NULL, ?, NULL)`,
    [id, now, now, model],
  );
  return {
    id,
    created_at: now,
    updated_at: now,
    title: null,
    model,
    model_messages: null,
  };
}

export function deleteSessionRow(id: string): boolean {
  const db = getDb();
  const r = db.run(`DELETE FROM sessions WHERE id = ?`, [id]);
  return r.changes > 0;
}

export function patchSessionRow(
  id: string,
  patch: {
    title?: string | null;
    model?: string | null;
    model_messages?: Array<Record<string, unknown>> | null;
    updated_at?: number;
  },
): boolean {
  const existing = getSessionById(id);
  if (!existing) return false;

  const title = patch.title !== undefined ? patch.title : existing.title;
  const model = patch.model !== undefined ? patch.model : existing.model;
  let modelMessagesJson: string | null = existing.model_messages;
  if (patch.model_messages !== undefined) {
    modelMessagesJson =
      patch.model_messages == null ? null : JSON.stringify(patch.model_messages);
  }
  const updatedAt = patch.updated_at ?? Date.now();

  getDb().run(
    `UPDATE sessions SET title = ?, model = ?, model_messages = ?, updated_at = ? WHERE id = ?`,
    [title, model, modelMessagesJson, updatedAt, id],
  );
  return true;
}

export function replaceSessionMessages(
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
    typeof chatModel === "string" && chatModel.trim() ? chatModel.trim() : row.model;
  const tx = db.transaction(() => {
    db.run(`DELETE FROM messages WHERE session_id = ?`, [sessionId]);
    const insert = db.prepare(
      `INSERT INTO messages (session_id, role, content, steps, position) VALUES (?, ?, ?, ?, ?)`,
    );
    let pos = 0;
    for (const m of messages) {
      const stepsJson =
        m.steps !== undefined && m.steps != null ? JSON.stringify(m.steps) : null;
      insert.run(sessionId, m.role, m.content, stepsJson, pos);
      pos += 1;
    }
    const mmJson = modelMessages == null ? null : JSON.stringify(modelMessages);
    db.run(`UPDATE sessions SET model_messages = ?, updated_at = ?, model = ? WHERE id = ?`, [
      mmJson,
      updatedAt,
      nextModel,
      sessionId,
    ]);
  });
  tx();
  return true;
}
