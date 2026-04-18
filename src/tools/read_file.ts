import fs from "node:fs/promises";
import type { Tool } from "ollama";
import type { RunContext } from "../RunContext";
import { SandboxError, resolveToolFilePath } from "../sessionDirectory";
import { BaseTool } from "./BaseTool";

export class ReadFileTool extends BaseTool {
  constructor() {
    super("read_file", "Read the contents of a file");
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
      const content = await fs.readFile(path, "utf8");
      return content;
    } catch (e) {
      return `Error: failed to read file ${path}: ${(e as Error).message}`;
    }
  }
}
