import { Router } from "express";
import { getDefaultChatAgent, setDefaultChatAgent } from "../db/index";

const settingsRoutes = Router();

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

export default settingsRoutes;
