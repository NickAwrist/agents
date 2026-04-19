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
  const cols = db.query("PRAGMA table_info(sessions)").all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === "agent_name")) {
    db.run("ALTER TABLE sessions ADD COLUMN agent_name TEXT");
  }
}

function migrateSessionsDirectoryColumn(db: Database) {
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
function migrateAgentsInlinePlaceholders(db: Database) {
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
  session_directory: string | null;
};

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

  migrateSessionsAgentColumn(db);
  migrateSessionsDirectoryColumn(db);
  migrateAgentsInlinePlaceholders(db);
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

function agentNameExistsInDb(name: string): boolean {
  return (
    getDb()
      .query("SELECT 1 FROM agents WHERE name = ? LIMIT 1")
      .get(name.trim()) != null
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
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
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
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
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
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
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
  const w = Number.parseInt(getAppSetting(COMFYUI_DEFAULT_WIDTH_KEY), 10);
  const h = Number.parseInt(getAppSetting(COMFYUI_DEFAULT_HEIGHT_KEY), 10);
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

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export type AgentRow = {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
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
    description:
      "Orchestrator agent that answers questions directly or delegates to specialized subagents.",
    tools: ["computer_agent", "web_search"],
    system_prompt: [
      "You are the orchestrator agent. You answer the user's request directly when you can, and delegate to your tools when the task requires capabilities you do not have.",
      "",
      "<delegation>",
      "When delegating, write a self-contained task description. Include all relevant context, file paths, code snippets, and exact success criteria so the subagent can complete the work without follow-up questions.",
      "You may chain multiple tool calls to accomplish complex tasks.",
      "</delegation>",
      "",
      "<response_rules>",
      "- Answer simple factual or conversational questions yourself without delegating.",
      "- After a tool returns, review its output. If the result is incomplete or contains errors, either retry with a corrected task or inform the user of what went wrong.",
      "- Be concise. Avoid restating entire tool output when a short summary and the key result suffice.",
      "- When presenting code, file contents, or command output, include the actual content — do not describe it abstractly.",
      "</response_rules>",
      "",
      "{{PERSONALIZATION}}",
    ].join("\n"),
  },
  {
    name: "computer_agent",
    description:
      "Runs shell commands, manages files, installs packages, and performs any OS-level task via bash. Provide a self-contained task description including the exact expected output or deliverable. Use for: running scripts, file operations (copy/move/delete), checking system state, git commands, process management.",
    tools: ["bash"],
    system_prompt: [
      "You are a computer-use agent with access to a bash shell. You execute commands, manage files, and interact with the operating system to complete tasks.",
      "",
      "<execution_rules>",
      "- Before running a destructive command (rm, overwrite, etc.), verify the target path exists and is correct.",
      "- If a command fails, read the error output carefully. Fix the issue (wrong path, missing dependency, permission) and retry — do not repeat the identical failing command.",
      "- For multi-step tasks, execute one step at a time and verify the result before proceeding.",
      "- Prefer simple, portable commands. Avoid unnecessary pipes or one-liners when clarity matters.",
      "</execution_rules>",
      "",
      "<output_rules>",
      "Your response is consumed by the orchestrator agent, not a human.",
      '- When asked to read files, list directories, or retrieve information: include the FULL, VERBATIM content in your response. Never summarize or say "I have read the file" without including its contents.',
      "- When asked to execute a command: include the complete stdout/stderr output.",
      "- When asked to perform an action (install, move, delete): confirm what was done and include any relevant output that proves success or shows failure.",
      "</output_rules>",
      "",
      "{{SESSION_DIRECTORY}}",
      "",
      "{{OS}}",
    ].join("\n"),
  },
  {
    name: "coding_agent",
    description:
      "Reads, writes, analyzes, and refactors source code. Can search codebases with grep, create/edit files, and verify changes with the TypeScript compiler. Provide specific instructions including file paths and expected outcomes. Use for: implementing features, fixing bugs, code review, reading code for analysis, writing tests.",
    tools: [
      "list_files",
      "create_file",
      "read_file",
      "run_tsc",
      "modify_plan",
      "grep",
    ],
    system_prompt: [
      "You are a software engineering agent. You read, write, analyze, and test code using the tools provided.",
      "",
      "<directory_conventions>",
      "When working in a directory, ALWAYS read the AGENT.md file first if it exists. This file contains project-specific guidelines, conventions, and instructions for the agent to follow.",
      "</directory_conventions>",
      "",
      "<workflow>",
      "1. UNDERSTAND: Read existing files and grep for context before making changes. Never guess at file structure.",
      "2. PLAN: For non-trivial changes, use modify_plan to record your approach before editing.",
      "3. IMPLEMENT: Create or modify files using the tools. Use full paths from the project root (e.g., `src/tools/filename.ts`).",
      "4. VERIFY: After every code change, run `run_tsc` to check for type errors. If errors are found, fix them and re-verify. Repeat until clean.",
      "</workflow>",
      "",
      "<tool_usage_rules>",
      "- Always use project-root-relative paths. If a tool returns ENOENT, check your path — do not retry the same path.",
      "- After deciding on a fix, apply it immediately with the appropriate tool. Never end your turn with only a textual description of what should change.",
      "- When creating files, ensure imports and dependencies are correct by reading neighboring files first.",
      "</tool_usage_rules>",
      "",
      "<output_rules>",
      "Your response is consumed by the orchestrator agent, not a human.",
      "- When asked to read or analyze code: include the actual code, findings, or data in your response. The orchestrator cannot see your tool results — only your final text response.",
      "- When asked to implement a change: confirm what files were created/modified, and include the verification results (e.g., tsc output).",
      "</output_rules>",
      "",
      "{{SESSION_DIRECTORY}}",
      "",
      "{{OS}}",
    ].join("\n"),
  },
];

function seedDefaultAgents(db: Database) {
  const count = db.query("SELECT COUNT(*) as c FROM agents").get() as {
    c: number;
  };
  if (count.c > 0) return;

  const now = Date.now();
  const insertAgent = db.prepare(
    "INSERT INTO agents (id, name, description, system_prompt, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
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
      "SELECT id, name, description, system_prompt, is_default, created_at, updated_at FROM agents ORDER BY created_at ASC",
    )
    .all() as AgentRow[];
  const toolStmt = db.query(
    "SELECT tool_name FROM agent_tools WHERE agent_id = ? ORDER BY position ASC",
  );
  return rows.map((r) => ({
    ...r,
    tools: (toolStmt.all(r.id) as { tool_name: string }[]).map(
      (t) => t.tool_name,
    ),
  }));
}

export function getAgentById(id: string): AgentWithTools | null {
  const db = getDb();
  const row = db
    .query(
      "SELECT id, name, description, system_prompt, is_default, created_at, updated_at FROM agents WHERE id = ?",
    )
    .get(id) as AgentRow | null;
  if (!row) return null;
  const tools = (
    db
      .query(
        "SELECT tool_name FROM agent_tools WHERE agent_id = ? ORDER BY position ASC",
      )
      .all(id) as { tool_name: string }[]
  ).map((t) => t.tool_name);
  return { ...row, tools };
}

export function getAgentByName(name: string): AgentWithTools | null {
  const db = getDb();
  const row = db
    .query(
      "SELECT id, name, description, system_prompt, is_default, created_at, updated_at FROM agents WHERE name = ?",
    )
    .get(name) as AgentRow | null;
  if (!row) return null;
  const tools = (
    db
      .query(
        "SELECT tool_name FROM agent_tools WHERE agent_id = ? ORDER BY position ASC",
      )
      .all(row.id) as { tool_name: string }[]
  ).map((t) => t.tool_name);
  return { ...row, tools };
}

export function createAgentRow(data: {
  name: string;
  description: string;
  system_prompt: string;
  tools: string[];
}): AgentWithTools {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  const tx = db.transaction(() => {
    db.run(
      "INSERT INTO agents (id, name, description, system_prompt, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
      [id, data.name, data.description, data.system_prompt, now, now],
    );
    const ins = db.prepare(
      "INSERT INTO agent_tools (agent_id, tool_name, position) VALUES (?, ?, ?)",
    );
    data.tools.forEach((t, i) => ins.run(id, t, i));
  });
  tx();
  return {
    id,
    name: data.name,
    description: data.description,
    system_prompt: data.system_prompt,
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
  },
): boolean {
  const db = getDb();
  const existing = getAgentById(id);
  if (!existing) return false;
  const now = Date.now();
  const tx = db.transaction(() => {
    db.run(
      "UPDATE agents SET name = ?, description = ?, system_prompt = ?, updated_at = ? WHERE id = ?",
      [data.name, data.description, data.system_prompt, now, id],
    );
    db.run("DELETE FROM agent_tools WHERE agent_id = ?", [id]);
    const ins = db.prepare(
      "INSERT INTO agent_tools (agent_id, tool_name, position) VALUES (?, ?, ?)",
    );
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
  db.run("UPDATE sessions SET agent_name = ? WHERE agent_name = ?", [
    fallback,
    row.name,
  ]);
  const r = db.run("DELETE FROM agents WHERE id = ?", [id]);
  return r.changes > 0;
}
