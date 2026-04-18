import { Router } from "express";
import { DEFAULT_CHAT_MODEL } from "../constants";
import { getOllamaClient } from "../ollamaClient";

const modelsRoutes = Router();

modelsRoutes.get("/", async (_req, res) => {
  try {
    const { models } = await getOllamaClient().list();
    res.json({
      defaultModel: DEFAULT_CHAT_MODEL,
      models: models.map((m) => ({
        name: m.name,
        size: m.size,
        modified_at:
          m.modified_at instanceof Date
            ? m.modified_at.toISOString()
            : String(m.modified_at),
        digest: m.digest,
        details: m.details,
      })),
    });
  } catch (e) {
    res.status(502).json({
      error: e instanceof Error ? e.message : String(e),
      defaultModel: DEFAULT_CHAT_MODEL,
      models: [],
    });
  }
});

export default modelsRoutes;
