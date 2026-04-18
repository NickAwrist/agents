import cors from "cors";
import express from "express";
import { getDb } from "./db/index";
import { logger } from "./logger";
import agentsRoutes from "./routes/agents";
import chatRoutes from "./routes/chat";
import comfyuiRoutes from "./routes/comfyui";
import modelsRoutes from "./routes/models";
import ollamaRoutes from "./routes/ollama";
import sessionRoutes from "./routes/sessions";
import settingsRoutes from "./routes/settings";
import toolsRoutes from "./routes/tools";

getDb();

const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ],
    credentials: false,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use("/api/tools", toolsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/agents", agentsRoutes);
app.use("/api/comfyui", comfyuiRoutes);
app.use("/api/ollama", ollamaRoutes);
app.use("/api/models", modelsRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/chat", chatRoutes);

const PORT = 3000;
app.listen(PORT, "127.0.0.1", () => {
  logger.info({ port: PORT, host: "127.0.0.1" }, "API server listening");
});
