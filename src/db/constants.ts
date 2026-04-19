import { join } from "node:path";

export const DB_PATH = join(process.cwd(), "data", "agents.db");

export const DEFAULT_CHAT_AGENT_KEY = "default_chat_agent";
export const OLLAMA_HOST_KEY = "ollama_host";
export const COMFYUI_HOST_KEY = "comfyui_host";
export const COMFYUI_DEFAULT_MODEL_KEY = "comfyui_default_model";
export const COMFYUI_DEFAULT_WIDTH_KEY = "comfyui_default_width";
export const COMFYUI_DEFAULT_HEIGHT_KEY = "comfyui_default_height";
export const COMFYUI_NEGATIVE_PROMPT_KEY = "comfyui_negative_prompt";

export const DEFAULT_COMFYUI_NEGATIVE_PROMPT =
  "low quality, worst quality, blurry, watermark, signature, text, bad anatomy, deformed, ugly, duplicate, extra fingers, poorly drawn hands, poorly drawn face, mutation, cropped";
