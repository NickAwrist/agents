import fs from "node:fs/promises";
import type { Tool } from "ollama";
import type { RunContext } from "../RunContext";
import { SandboxError, resolveToolFilePath } from "../sessionDirectory";
import { BaseTool } from "./BaseTool";

export class CreateFileTool extends BaseTool {
  constructor() {
    super("create_file", "Create a new file");
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
            content: {
              type: "string",
              description:
                "File contents (use lines array instead if content is multiline)",
            },
            lines: {
              type: "array",
              items: { type: "string" },
              description:
                "File contents as an array of strings. RECOMMENDED over content if your code contains newlines.",
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
    const content =
      typeof args.content === "string"
        ? args.content
        : Array.isArray(args.lines)
          ? args.lines.join("\n")
          : "";
    await fs.writeFile(path, content);
    return `File created at ${path}`;
  }
}
