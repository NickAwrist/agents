import type { Tool } from "ollama";
import { BaseTool } from "./BaseTool";
import { getComfyUIClient } from "../comfyui/client";
import { buildImageWorkflow } from "../comfyui/workflows";
import { getComfyUIDefaultModel, getComfyUIImageSize } from "../db/index";
import crypto from "node:crypto";

export class GenerateImageTool extends BaseTool {
  constructor() {
    super(
      "generate_image",
      "Generate an image from a text prompt using ComfyUI. Returns the URL of the generated image.",
    );
  }

  override toTool(): Tool {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: "object",
          required: ["prompt"],
          properties: {
            prompt: {
              type: "string",
              description: "A detailed text description of the image to generate.",
            },
          },
        },
      },
    };
  }

  override async execute(args: Record<string, unknown>): Promise<string> {
    if (typeof args.prompt !== "string" || args.prompt.trim().length === 0) {
      return "Error: prompt must be a non-empty string";
    }

    const client = getComfyUIClient();

    const health = await client.healthCheck();
    if (!health.ok) {
      return `Error: ComfyUI is not reachable — ${health.error ?? "unknown error"}`;
    }

    const defaultModel = getComfyUIDefaultModel();
    let checkpointName = defaultModel;
    if (!checkpointName) {
      const models = await client.getModels();
      if (models.length === 0) {
        return "Error: No models available in ComfyUI";
      }
      checkpointName = models[0]!;
    }

    const { width, height } = getComfyUIImageSize();
    const clientId = crypto.randomUUID();

    const workflow = buildImageWorkflow({
      prompt: args.prompt.trim(),
      checkpointName,
      width,
      height,
    });

    try {
      await client.connectWebSocket(clientId);
      const response = await client.queuePrompt(workflow, clientId);
      const images = await client.waitForPrompt(response.prompt_id);

      const img = images[0];
      if (!img) {
        return "Error: Image generation completed but no images were produced";
      }

      // Build the proxy URL - the filename is already in the path, query params are for the backend
      const params = new URLSearchParams({ type: img.type });
      if (img.subfolder) params.set("subfolder", img.subfolder);
      const queryString = params.toString();
      return `/api/comfyui/view/${img.filename}${queryString ? `?${queryString}` : ""}`;
    } catch (e) {
      return `Error generating image: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}
