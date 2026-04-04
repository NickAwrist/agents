import type { Tool } from "ollama";
import { BaseTool } from "./BaseTool";
import fs from 'fs/promises';
import pathModule from 'path';
import ignore from 'ignore';
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
    files = await this.filterGitignore(path, files);

    return 'List of files: ' + files.join(', ');
  }

  private async filterGitignore(path: string, files: string[]): Promise<string[]> {
    try {
      const gitignorePath = pathModule.join(path, '.gitignore');
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
      const ig = ignore().add(gitignoreContent);
      files = files.filter(f => !ig.ignores(f.endsWith('/') ? f.slice(0, -1) : f));
    } catch (e) {
      // Ignore error if .gitignore doesn't exist
    }
    return files;
  }
}