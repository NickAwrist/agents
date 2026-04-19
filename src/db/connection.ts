import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { seedDefaultAgents } from "./agents/seed";
import { ensureDefaultChatAgentSetting } from "./bootstrap";
import { DB_PATH } from "./constants";
import { runMigrations } from "./migrations";

let dbSingleton: Database | null = null;

export function getDb(): Database {
  if (dbSingleton) return dbSingleton;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.run("PRAGMA foreign_keys = ON;");
  db.run("PRAGMA journal_mode = WAL;");
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      title TEXT,
      model TEXT,
      model_messages TEXT,
      agent_name TEXT
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

  db.run(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      tool_name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      UNIQUE(agent_id, tool_name)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  runMigrations(db);
  seedDefaultAgents(db);
  ensureDefaultChatAgentSetting(db);

  dbSingleton = db;
  return db;
}
