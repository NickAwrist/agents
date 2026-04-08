import type { Tool } from "ollama";
import { BaseTool } from "./BaseTool";
import fs from 'fs/promises';
import { loadGitignore } from "../utils/gitignoreFilter";

export class ListFilesTool extends BaseTool {
  constructor() {
    super('list_files', 'List all files in the current directory');
  }

  override toTool(): Tool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path (relative to cwd or absolute). If not provided, the current directory is used.' },
          },
        },
      },
    };
  }

  override async execute(args: Record<string, unknown>): Promise<string> {
    const path =
      typeof args.path === 'string' && args.path.length > 0
        ? args.path
        : process.cwd();
    const entries = await fs.readdir(path, { withFileTypes: true });
    let files = entries.map(entry => entry.isDirectory() ? entry.name + '/' : entry.name);

    const ig = await loadGitignore(path);
    files = files.filter(f => !ig.ignores(f.endsWith('/') ? f.slice(0, -1) : f));

    return 'List of files: ' + files.join(', ');
  }
}