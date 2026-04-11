import express from "express";
import cors from "cors";
import { getDb } from "./db/index";
import { toolsRoutes, settingsRoutes, agentsRoutes } from "./routes/agents";
import comfyuiRoutes from "./routes/comfyui";
import ollamaRoutes, { modelsRoutes } from "./routes/ollama";
import sessionRoutes from "./routes/sessions";
import chatRoutes from "./routes/chat";

getDb();

const app = express();
app.use(cors());
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
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Backend] API Server running on port ${PORT} across the network`);
});
