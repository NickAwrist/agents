import type { Tool } from "ollama";
import { BaseTool } from "./BaseTool";
import fs from "fs/promises";
import type { RunContext } from "../RunContext";
import { resolveToolFilePath } from "../sessionDirectory";

export class ReadFileTool extends BaseTool {
  constructor() {
    super('read_file', 'Read the contents of a file');
  }

  override toTool(): Tool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          required: ['path'],
          properties: {
            path: { 
              type: 'string', description: 'File path (relative to cwd or absolute)' },
            },
        },
      },
    };
  }

  override async execute(args: Record<string, unknown>, ctx?: RunContext): Promise<string> {
    const rawPath =
      typeof args.path === "string" && args.path.length > 0
        ? args.path
        : typeof args.filename === "string" && args.filename.length > 0
          ? args.filename
          : "";
    const path = resolveToolFilePath(rawPath, ctx?.sessionDir);
    if (!path) {
      return "Error: missing path (provide path or filename)";
    }
    try {
      const content = await fs.readFile(path, 'utf8');
      return content;
    } catch (e) {
      return 'Error: failed to read file ' + path + ': ' + (e as Error).message;
    }
  }
}