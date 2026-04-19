import type { Database } from "bun:sqlite";

export function migrateSessionsAgentColumn(db: Database) {
  const cols = db.query("PRAGMA table_info(sessions)").all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === "agent_name")) {
    db.run("ALTER TABLE sessions ADD COLUMN agent_name TEXT");
  }
}

export function migrateSessionsDirectoryColumn(db: Database) {
  const cols = db.query("PRAGMA table_info(sessions)").all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === "session_directory")) {
    db.run("ALTER TABLE sessions ADD COLUMN session_directory TEXT");
  }
}

/**
 * One-shot migration from the old `include_personalization` / `include_session_directory` /
 * `include_os_info` flags to inline `{{PLACEHOLDER}}` tokens in `system_prompt`.
 */
export function migrateAgentsInlinePlaceholders(db: Database) {
  const cols = db.query("PRAGMA table_info(agents)").all() as {
    name: string;
  }[];
  const hasAny =
    cols.some((c) => c.name === "include_personalization") ||
    cols.some((c) => c.name === "include_session_directory") ||
    cols.some((c) => c.name === "include_os_info");
  if (!hasAny) return;

  const rows = db
    .query(
      "SELECT id, system_prompt, include_personalization, include_session_directory, include_os_info FROM agents",
    )
    .all() as Array<{
    id: string;
    system_prompt: string;
    include_personalization: number | null;
    include_session_directory: number | null;
    include_os_info: number | null;
  }>;

  const update = db.prepare("UPDATE agents SET system_prompt = ? WHERE id = ?");
  const tx = db.transaction(() => {
    for (const r of rows) {
      const parts: string[] = [r.system_prompt ?? ""];
      const has = (tok: string) => parts[0]!.includes(tok);
      if (r.include_personalization && !has("{{PERSONALIZATION}}")) {
        parts.push("{{PERSONALIZATION}}");
      }
      if (r.include_session_directory && !has("{{SESSION_DIRECTORY}}")) {
        parts.push("{{SESSION_DIRECTORY}}");
      }
      if (r.include_os_info && !has("{{OS}}")) {
        parts.push("{{OS}}");
      }
      if (parts.length > 1) {
        update.run(parts.filter((s) => s.length > 0).join("\n\n"), r.id);
      }
    }
  });
  tx();

  if (cols.some((c) => c.name === "include_personalization")) {
    db.run("ALTER TABLE agents DROP COLUMN include_personalization");
  }
  if (cols.some((c) => c.name === "include_session_directory")) {
    db.run("ALTER TABLE agents DROP COLUMN include_session_directory");
  }
  if (cols.some((c) => c.name === "include_os_info")) {
    db.run("ALTER TABLE agents DROP COLUMN include_os_info");
  }
}

export function runMigrations(db: Database) {
  migrateSessionsAgentColumn(db);
  migrateSessionsDirectoryColumn(db);
  migrateAgentsInlinePlaceholders(db);
}
