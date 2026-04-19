import { Router } from "express";
import {
  createAgentRow,
  deleteAgentRow,
  getAgentById,
  listAgents,
  updateAgentRow,
} from "../db/index";

const agentsRoutes = Router();

type AgentWriteBody = {
  name?: unknown;
  description?: unknown;
  system_prompt?: unknown;
  tools?: unknown;
};

function parseAgentBody(body: AgentWriteBody):
  | {
      ok: true;
      data: {
        name: string;
        description: string;
        system_prompt: string;
        tools: string[];
      };
    }
  | { ok: false; error: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { ok: false, error: "name is required" };
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const system_prompt =
    typeof body.system_prompt === "string" ? body.system_prompt.trim() : "";
  const tools = Array.isArray(body.tools)
    ? body.tools.filter((t): t is string => typeof t === "string")
    : [];
  return { ok: true, data: { name, description, system_prompt, tools } };
}

agentsRoutes.get("/", (_req, res) => {
  res.json({ agents: listAgents() });
});

agentsRoutes.get("/:id", (req, res) => {
  const agent = getAgentById(req.params.id);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(agent);
});

agentsRoutes.post("/", (req, res) => {
  const parsed = parseAgentBody(req.body as AgentWriteBody);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const agent = createAgentRow(parsed.data);
    res.status(201).json(agent);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("UNIQUE constraint")) {
      res.status(409).json({ error: "An agent with that name already exists" });
      return;
    }
    throw e;
  }
});

agentsRoutes.put("/:id", (req, res) => {
  const parsed = parseAgentBody(req.body as AgentWriteBody);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  try {
    const ok = updateAgentRow(req.params.id, parsed.data);
    if (!ok) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("UNIQUE constraint")) {
      res.status(409).json({ error: "An agent with that name already exists" });
      return;
    }
    throw e;
  }
});

agentsRoutes.delete("/:id", (req, res) => {
  const ok = deleteAgentRow(req.params.id);
  if (!ok) {
    res.status(400).json({
      error:
        "Agent not found or cannot delete the required general_agent fallback",
    });
    return;
  }
  res.json({ ok: true });
});

export default agentsRoutes;
