import fs from "node:fs/promises";
import { homedir } from "node:os";
import type { Tool } from "ollama";
import type { RunContext } from "../RunContext";
import { SandboxError, resolveToolFilePath } from "../sessionDirectory";
import { loadGitignore } from "../utils/gitignoreFilter";
import { BaseTool } from "./BaseTool";

export class ListFilesTool extends BaseTool {
  constructor() {
    super("list_files", "List all files in the current directory");
  }

  override toTool(): Tool {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Directory path (relative to cwd or absolute). If not provided, the current directory is used.",
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
    const raw =
      typeof args.path === "string" && args.path.length > 0
        ? args.path
        : (ctx?.sessionDir ?? homedir());
    let path: string;
    try {
      path = resolveToolFilePath(raw, ctx?.sessionDir, {
        enforceSandbox: true,
      });
    } catch (e) {
      if (e instanceof SandboxError) {
        return `Error: ${e.message}`;
      }
      throw e;
    }
    const entries = await fs.readdir(path, { withFileTypes: true });
    let files = entries.map((entry) =>
      entry.isDirectory() ? `${entry.name}/` : entry.name,
    );

    const ig = await loadGitignore(path);
    files = files.filter(
      (f) => !ig.ignores(f.endsWith("/") ? f.slice(0, -1) : f),
    );

    return `List of files: ${files.join(", ")}`;
  }
}
