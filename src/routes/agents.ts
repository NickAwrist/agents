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

export const toolsRoutes = Router();

toolsRoutes.get("/", (_req, res) => {
  res.json({ tools: [...BUILTIN_TOOLS] });
});

export const settingsRoutes = Router();

settingsRoutes.get("/default-chat-agent", (_req, res) => {
  res.json({ agentName: getDefaultChatAgent() });
});

settingsRoutes.put("/default-chat-agent", (req, res) => {
  const raw = (req.body as { agentName?: unknown }).agentName;
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name || !setDefaultChatAgent(name)) {
    res.status(400).json({ error: "Invalid agent name" });
    return;
  }
  res.json({ ok: true, agentName: getDefaultChatAgent() });
});

export const agentsRoutes = Router();

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
  const {
    name,
    description,
    system_prompt,
    tools,
    include_personalization,
    include_session_directory,
    include_os_info,
  } = req.body as {
    name?: string;
    description?: string;
    system_prompt?: string;
    tools?: string[];
    include_personalization?: unknown;
    include_session_directory?: unknown;
    include_os_info?: unknown;
  };
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const inc =
    include_personalization === false || include_personalization === 0 ? 0 : 1;
  const incSd =
    include_session_directory === true || include_session_directory === 1 ? 1 : 0;
  const incOs = include_os_info === true || include_os_info === 1 ? 1 : 0;
  try {
    const agent = createAgentRow({
      name: name.trim(),
      description: description?.trim() ?? "",
      system_prompt: system_prompt?.trim() ?? "",
      tools: Array.isArray(tools) ? tools : [],
      include_personalization: inc,
      include_session_directory: incSd,
      include_os_info: incOs,
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

agentsRoutes.put("/:id", (req, res) => {
  const {
    name,
    description,
    system_prompt,
    tools,
    include_personalization,
    include_session_directory,
    include_os_info,
  } = req.body as {
    name?: string;
    description?: string;
    system_prompt?: string;
    tools?: string[];
    include_personalization?: unknown;
    include_session_directory?: unknown;
    include_os_info?: unknown;
  };
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const inc =
    include_personalization === false || include_personalization === 0 ? 0 : 1;
  const incSd =
    include_session_directory === true || include_session_directory === 1 ? 1 : 0;
  const incOs = include_os_info === true || include_os_info === 1 ? 1 : 0;
  try {
    const ok = updateAgentRow(req.params.id, {
      name: name.trim(),
      description: description?.trim() ?? "",
      system_prompt: system_prompt?.trim() ?? "",
      tools: Array.isArray(tools) ? tools : [],
      include_personalization: inc,
      include_session_directory: incSd,
      include_os_info: incOs,
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

agentsRoutes.delete("/:id", (req, res) => {
  const ok = deleteAgentRow(req.params.id);
  if (!ok) {
    res.status(400).json({
      error: "Agent not found or cannot delete the required general_agent fallback",
    });
    return;
  }
  res.json({ ok: true });
});
