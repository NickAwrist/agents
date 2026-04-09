import { Router } from "express";
import {
  listAgents,
  getAgentById,
  createAgentRow,
  updateAgentRow,
  deleteAgentRow,
  getDefaultChatAgent,
  setDefaultChatAgent,
} from "../db/index";
import { BUILTIN_TOOLS } from "../agents/agentManager";

const router = Router();

router.get("/api/tools", (_req, res) => {
  res.json({ tools: [...BUILTIN_TOOLS] });
});

router.get("/api/settings/default-chat-agent", (_req, res) => {
  res.json({ agentName: getDefaultChatAgent() });
});

router.put("/api/settings/default-chat-agent", (req, res) => {
  const raw = (req.body as { agentName?: unknown }).agentName;
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name || !setDefaultChatAgent(name)) {
    res.status(400).json({ error: "Invalid agent name" });
    return;
  }
  res.json({ ok: true, agentName: getDefaultChatAgent() });
});

router.get("/api/agents", (_req, res) => {
  res.json({ agents: listAgents() });
});

router.get("/api/agents/:id", (req, res) => {
  const agent = getAgentById(req.params.id);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(agent);
});

router.post("/api/agents", (req, res) => {
  const { name, description, system_prompt, tools } = req.body as {
    name?: string;
    description?: string;
    system_prompt?: string;
    tools?: string[];
  };
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  try {
    const agent = createAgentRow({
      name: name.trim(),
      description: description?.trim() ?? "",
      system_prompt: system_prompt?.trim() ?? "",
      tools: Array.isArray(tools) ? tools : [],
    });
    res.status(201).json(agent);
  } catch (e: any) {
    if (e?.message?.includes("UNIQUE constraint")) {
      res.status(409).json({ error: "An agent with that name already exists" });
      return;
    }
    throw e;
  }
});

router.put("/api/agents/:id", (req, res) => {
  const { name, description, system_prompt, tools } = req.body as {
    name?: string;
    description?: string;
    system_prompt?: string;
    tools?: string[];
  };
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  try {
    const ok = updateAgentRow(req.params.id, {
      name: name.trim(),
      description: description?.trim() ?? "",
      system_prompt: system_prompt?.trim() ?? "",
      tools: Array.isArray(tools) ? tools : [],
    });
    if (!ok) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.message?.includes("UNIQUE constraint")) {
      res.status(409).json({ error: "An agent with that name already exists" });
      return;
    }
    throw e;
  }
});

router.delete("/api/agents/:id", (req, res) => {
  const ok = deleteAgentRow(req.params.id);
  if (!ok) {
    res.status(400).json({ error: "Agent not found or is a default agent" });
    return;
  }
  res.json({ ok: true });
});

export default router;
