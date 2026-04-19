import crypto from "node:crypto";
import { getDb } from "../connection";
import { DEFAULT_CHAT_AGENT_KEY } from "../constants";
import type { AgentRow, AgentWithTools } from "./types";

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
  const r = db.run("DELETE FROM agents WHERE id = ?", [id]);
  return r.changes > 0;
}
