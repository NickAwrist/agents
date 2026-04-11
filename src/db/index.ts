import { Database } from "bun:sqlite";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const DB_PATH = join(process.cwd(), "data", "agents.db");

const DEFAULT_CHAT_AGENT_KEY = "default_chat_agent";
const OLLAMA_HOST_KEY = "ollama_host";
const COMFYUI_HOST_KEY = "comfyui_host";
const COMFYUI_DEFAULT_MODEL_KEY = "comfyui_default_model";
const COMFYUI_DEFAULT_WIDTH_KEY = "comfyui_default_width";
const COMFYUI_DEFAULT_HEIGHT_KEY = "comfyui_default_height";
const COMFYUI_NEGATIVE_PROMPT_KEY = "comfyui_negative_prompt";

export const DEFAULT_COMFYUI_NEGATIVE_PROMPT =
  "low quality, worst quality, blurry, watermark, signature, text, bad anatomy, deformed, ugly, duplicate, extra fingers, poorly drawn hands, poorly drawn face, mutation, cropped";

function migrateSessionsAgentColumn(db: Database) {
  const cols = db.query("PRAGMA table_info(sessions)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "agent_name")) {
    db.run("ALTER TABLE sessions ADD COLUMN agent_name TEXT");
  }
}

function migrateAgentsIncludePersonalizationColumn(db: Database) {
  const cols = db.query("PRAGMA table_info(agents)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "include_personalization")) {
    db.run("ALTER TABLE agents ADD COLUMN include_personalization INTEGER NOT NULL DEFAULT 1");
  }
}

function ensureDefaultChatAgentSetting(db: Database) {
  db.run("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", [
    DEFAULT_CHAT_AGENT_KEY,
    "general_agent",
  ]);
}

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
  agent_name: string | null;
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

  migrateSessionsAgentColumn(db);
  migrateAgentsIncludePersonalizationColumn(db);
  seedDefaultAgents(db);
  ensureDefaultChatAgentSetting(db);

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
      `SELECT id, created_at, updated_at, title, model, model_messages, agent_name FROM sessions WHERE id = ?`,
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

function agentNameExistsInDb(name: string): boolean {
  return (
    getDb().query("SELECT 1 FROM agents WHERE name = ? LIMIT 1").get(name.trim()) != null
  );
}

export function getDefaultChatAgent(): string {
  const row = getDb()
    .query("SELECT value FROM app_settings WHERE key = ?")
    .get(DEFAULT_CHAT_AGENT_KEY) as { value: string } | null;
  const v = row?.value?.trim();
  if (v && agentNameExistsInDb(v)) return v;
  return "general_agent";
}

export function setDefaultChatAgent(name: string): boolean {
  const t = name.trim();
  if (!t || !agentNameExistsInDb(t)) return false;
  getDb().run(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [DEFAULT_CHAT_AGENT_KEY, t],
  );
  return true;
}

/** Stored value only; empty means use the default local Ollama URL. */
export function getOllamaHost(): string {
  const row = getDb()
    .query("SELECT value FROM app_settings WHERE key = ?")
    .get(OLLAMA_HOST_KEY) as { value: string } | null;
  return row?.value?.trim() ?? "";
}

export function setOllamaHost(host: string): void {
  getDb().run(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [OLLAMA_HOST_KEY, host.trim()],
  );
}

// ---------------------------------------------------------------------------
// ComfyUI settings
// ---------------------------------------------------------------------------

function getAppSetting(key: string): string {
  const row = getDb()
    .query("SELECT value FROM app_settings WHERE key = ?")
    .get(key) as { value: string } | null;
  return row?.value?.trim() ?? "";
}

function setAppSetting(key: string, value: string): void {
  getDb().run(
    `INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value.trim()],
  );
}

export function getComfyUIHost(): string {
  return getAppSetting(COMFYUI_HOST_KEY);
}

export function setComfyUIHost(host: string): void {
  setAppSetting(COMFYUI_HOST_KEY, host);
}

export function getComfyUIDefaultModel(): string {
  return getAppSetting(COMFYUI_DEFAULT_MODEL_KEY);
}

export function setComfyUIDefaultModel(model: string): void {
  setAppSetting(COMFYUI_DEFAULT_MODEL_KEY, model);
}

export function getComfyUIImageSize(): { width: number; height: number } {
  const w = parseInt(getAppSetting(COMFYUI_DEFAULT_WIDTH_KEY), 10);
  const h = parseInt(getAppSetting(COMFYUI_DEFAULT_HEIGHT_KEY), 10);
  return { width: w > 0 ? w : 1440, height: h > 0 ? h : 1440 };
}

export function setComfyUIImageSize(width: number, height: number): void {
  setAppSetting(COMFYUI_DEFAULT_WIDTH_KEY, String(width));
  setAppSetting(COMFYUI_DEFAULT_HEIGHT_KEY, String(height));
}

export function getComfyUINegativePrompt(): string {
  const row = getDb()
    .query("SELECT value FROM app_settings WHERE key = ?")
    .get(COMFYUI_NEGATIVE_PROMPT_KEY) as { value: string } | null;
  if (row === null) return DEFAULT_COMFYUI_NEGATIVE_PROMPT;
  return row.value.trim();
}

export function setComfyUINegativePrompt(value: string): void {
  setAppSetting(COMFYUI_NEGATIVE_PROMPT_KEY, value);
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
    `INSERT INTO sessions (id, created_at, updated_at, title, model, model_messages, agent_name) VALUES (?, ?, ?, NULL, ?, NULL, ?)`,
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
    agent_name?: string | null;
    updated_at?: number;
  },
): boolean {
  const existing = getSessionById(id);
  if (!existing) return false;

  const title = patch.title !== undefined ? patch.title : existing.title;
  const model = patch.model !== undefined ? patch.model : existing.model;
  const agentName = patch.agent_name !== undefined ? patch.agent_name : existing.agent_name;
  let modelMessagesJson: string | null = existing.model_messages;
  if (patch.model_messages !== undefined) {
    modelMessagesJson =
      patch.model_messages == null ? null : JSON.stringify(patch.model_messages);
  }
  const updatedAt = patch.updated_at ?? Date.now();

  getDb().run(
    `UPDATE sessions SET title = ?, model = ?, model_messages = ?, agent_name = ?, updated_at = ? WHERE id = ?`,
    [title, model, modelMessagesJson, agentName, updatedAt, id],
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

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export type AgentRow = {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  include_personalization: number;
  is_default: number;
  created_at: number;
  updated_at: number;
};

export type AgentWithTools = AgentRow & { tools: string[] };

const DEFAULT_AGENTS: Array<{
  name: string;
  description: string;
  system_prompt: string;
  tools: string[];
}> = [
  {
    name: "general_agent",
    description: "A general agent that can answer general queries or call agents to perform tasks.",
    tools: ["coding_agent", "computer_agent", "web_search"],
    system_prompt: "You are a helpful assistant.",
  },
  {
    name: "code_discovery_agent",
    description: "An agent that helps find where a certain functionality is located in the codebase. If you do now know where a particular feature is, instead of listing all the files and reading each, just call this tool.",
    tools: ["list_files", "read_file", "modify_plan", "grep"],
    system_prompt: "You are an expert code discovery agent. Your primary goal is to help users locate specific functionality, classes, methods, or logic within a codebase.\n\nYour process should generally be:\n1. Use 'list_files' to understand the overall project structure.\n2. Use 'grep' to search for keywords, function names, or strings related to the functionality.\n3. Use 'read_file' to examine the contents of promising files and confirm if they contain the target functionality.\n4. Use 'modify_plan' to track your search progress and refine your strategy.\n\nWhen you find the functionality, provide the exact file path and the line numbers or code snippet where it is located. Be thorough and explain why you believe this is the correct location.\n\nCRITICAL RULES FOR TOOL USAGE:\n1. ALWAYS use the full path from the project root when reading or searching files.\n2. If a search returns too many results, refine your grep pattern or use list_files to narrow down the directory.",
  },
  {
    name: "computer_agent",
    description: "A computer agent that can perform tasks that require a computer. When calling this subagent, you must provide the expected result you desire from the task.",
    tools: ["bash"],
    system_prompt: "You are a computer agent that can perform tasks that require a computer. You are to complete the task to the best of your ability given the tools available to you.\nYour response is to another AI agent. CRITICAL: If your task involves reading files, listing directories, or retrieving any information, you MUST include the actual, full contents or results in your final response. Do NOT summarize or just state that you have completed the read; the requesting agent needs the actual data to proceed.",
  },
  {
    name: "coding_agent",
    description: "A coding that can process coding and programming tasks. Provide specific instructions and expected outcomes when calling it.",
    tools: ["list_files", "create_file", "read_file", "run_tsc", "modify_plan", "grep"],
    system_prompt: "You are an expert software engineering agent capable of processing complex programming tasks, refactoring code, writing tests, and implementing features.\nAnalyze the problem step-by-step before making changes. Use the provided tools to read existing code context, create new files, or apply fixes.\n\nCRITICAL RULES FOR TOOL USAGE:\n1. ALWAYS use the full path from the project root (e.g., 'src/tools/filename.ts' instead of just 'filename.ts') when reading or creating files.\n2. If a tool call fails (like getting an ENOENT error), DO NOT repeatedly call the same tool with the same arguments. Analyze the error and fix your path.\n\nTESTING AND ITERATION:\nWhenever you write or modify code (or create a file), you MUST use your tools to test it (e.g., use the run_tsc tool to check for type errors) before considering your task complete. If your test tool outputs any errors or fails, you must analyze the logs, modify your code to fix the root cause, and re-test. Continually iterate this fix-and-test loop until your tests pass successfully.\n\nCRITICAL LOOP REQUIREMENT: If you find an error and decide how to fix it, do NOT just output the \"Corrected structure\" as a text response. You MUST immediately call the appropriate tool (like create_file) to apply your fix to the file system. Your turn should end with a tool call, not a textual summary of what should be done.\n\nCRITICAL: Your response is being sent back to the orchestrator AI agent. If you are asked to read code, summarize your findings, or perform analysis, you MUST include the actual results, complete code, or findings in your final response. Do NOT provide a generic summary stating that you completed the read. The orchestrator depends on your output.",
  },
];

function seedDefaultAgents(db: Database) {
  const count = db.query("SELECT COUNT(*) as c FROM agents").get() as { c: number };
  if (count.c > 0) return;

  const now = Date.now();
  const insertAgent = db.prepare(
    "INSERT INTO agents (id, name, description, system_prompt, include_personalization, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?)",
  );
  const insertTool = db.prepare(
    "INSERT INTO agent_tools (agent_id, tool_name, position) VALUES (?, ?, ?)",
  );

  const tx = db.transaction(() => {
    for (const a of DEFAULT_AGENTS) {
      const id = crypto.randomUUID();
      insertAgent.run(id, a.name, a.description, a.system_prompt, now, now);
      a.tools.forEach((t, i) => insertTool.run(id, t, i));
    }
  });
  tx();
}

export function listAgents(): AgentWithTools[] {
  const db = getDb();
  const rows = db
    .query(
      "SELECT id, name, description, system_prompt, include_personalization, is_default, created_at, updated_at FROM agents ORDER BY created_at ASC",
    )
    .all() as AgentRow[];
  const toolStmt = db.query(
    "SELECT tool_name FROM agent_tools WHERE agent_id = ? ORDER BY position ASC",
  );
  return rows.map((r) => ({
    ...r,
    tools: (toolStmt.all(r.id) as { tool_name: string }[]).map((t) => t.tool_name),
  }));
}

export function getAgentById(id: string): AgentWithTools | null {
  const db = getDb();
  const row = db
    .query(
      "SELECT id, name, description, system_prompt, include_personalization, is_default, created_at, updated_at FROM agents WHERE id = ?",
    )
    .get(id) as AgentRow | null;
  if (!row) return null;
  const tools = (
    db.query("SELECT tool_name FROM agent_tools WHERE agent_id = ? ORDER BY position ASC").all(id) as { tool_name: string }[]
  ).map((t) => t.tool_name);
  return { ...row, tools };
}

export function getAgentByName(name: string): AgentWithTools | null {
  const db = getDb();
  const row = db
    .query(
      "SELECT id, name, description, system_prompt, include_personalization, is_default, created_at, updated_at FROM agents WHERE name = ?",
    )
    .get(name) as AgentRow | null;
  if (!row) return null;
  const tools = (
    db.query("SELECT tool_name FROM agent_tools WHERE agent_id = ? ORDER BY position ASC").all(row.id) as { tool_name: string }[]
  ).map((t) => t.tool_name);
  return { ...row, tools };
}

export function createAgentRow(
  data: {
    name: string;
    description: string;
    system_prompt: string;
    tools: string[];
    include_personalization: number;
  },
): AgentWithTools {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  const inc = data.include_personalization ? 1 : 0;
  const tx = db.transaction(() => {
    db.run(
      "INSERT INTO agents (id, name, description, system_prompt, include_personalization, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
      [id, data.name, data.description, data.system_prompt, inc, now, now],
    );
    const ins = db.prepare("INSERT INTO agent_tools (agent_id, tool_name, position) VALUES (?, ?, ?)");
    data.tools.forEach((t, i) => ins.run(id, t, i));
  });
  tx();
  return {
    id,
    name: data.name,
    description: data.description,
    system_prompt: data.system_prompt,
    include_personalization: inc,
    is_default: 0,
    created_at: now,
    updated_at: now,
    tools: data.tools,
  };
}

export function updateAgentRow(
  id: string,
  data: {
    name: string;
    description: string;
    system_prompt: string;
    tools: string[];
    include_personalization: number;
  },
): boolean {
  const db = getDb();
  const existing = getAgentById(id);
  if (!existing) return false;
  const now = Date.now();
  const inc = data.include_personalization ? 1 : 0;
  const tx = db.transaction(() => {
    db.run(
      "UPDATE agents SET name = ?, description = ?, system_prompt = ?, include_personalization = ?, updated_at = ? WHERE id = ?",
      [data.name, data.description, data.system_prompt, inc, now, id],
    );
    db.run("DELETE FROM agent_tools WHERE agent_id = ?", [id]);
    const ins = db.prepare("INSERT INTO agent_tools (agent_id, tool_name, position) VALUES (?, ?, ?)");
    data.tools.forEach((t, i) => ins.run(id, t, i));
  });
  tx();
  return true;
}

export function deleteAgentRow(id: string): boolean {
  const db = getDb();
  const fallback = "general_agent";
  const row = db
    .query("SELECT name FROM agents WHERE id = ? AND name != ?")
    .get(id, fallback) as { name: string } | null;
  if (!row) return false;
  db.run("UPDATE app_settings SET value = ? WHERE key = ? AND value = ?", [
    fallback,
    DEFAULT_CHAT_AGENT_KEY,
    row.name,
  ]);
  db.run("UPDATE sessions SET agent_name = ? WHERE agent_name = ?", [fallback, row.name]);
  const r = db.run("DELETE FROM agents WHERE id = ?", [id]);
  return r.changes > 0;
}
