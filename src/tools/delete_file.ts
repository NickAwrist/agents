import fs from "node:fs/promises";
import type { Tool } from "ollama";
import type { RunContext } from "../RunContext";
import { SandboxError, resolveToolFilePath } from "../sessionDirectory";
import { BaseTool } from "./BaseTool";

export class DeleteFileTool extends BaseTool {
  constructor() {
    super("delete_file", "Delete a file");
  }

  override toTool(): Tool {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: "object",
          required: ["path"],
          properties: {
            path: {
              type: "string",
              description: "File path (relative to cwd or absolute)",
            },
          },
        },
      },
    };
  }

  override async execute(
    args: Record<string, unknown>,
    ctx?: RunContext,
  ): Promise<string> {
    const rawPath =
      typeof args.path === "string" && args.path.length > 0
        ? args.path
        : typeof args.filename === "string" && args.filename.length > 0
          ? args.filename
          : "";
    let path: string;
    try {
      path = resolveToolFilePath(rawPath, ctx?.sessionDir, {
        enforceSandbox: true,
      });
    } catch (e) {
      if (e instanceof SandboxError) {
        return `Error: ${e.message}`;
      }
      throw e;
    }
    if (!path) {
      return "Error: missing path (provide path or filename)";
    }
    try {
      await fs.unlink(path);
      return `File deleted at ${path}`;
    } catch (e) {
      return `Error: failed to delete file ${path}: ${(e as Error).message}`;
    }
  }
}
