import { Router } from "express";
import { BUILTIN_TOOLS } from "../agents/agentManager";

const toolsRoutes = Router();

toolsRoutes.get("/", (_req, res) => {
  res.json({ tools: [...BUILTIN_TOOLS] });
});

export default toolsRoutes;
