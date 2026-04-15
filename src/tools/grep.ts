import { homedir } from "node:os";
import type { Tool } from "ollama";
import type { Ignore } from "ignore";
import { BaseTool } from "./BaseTool";
import fs from "fs/promises";
import pathModule from "path";
import type { RunContext } from "../RunContext";
import { resolveToolFilePath } from "../sessionDirectory";
import { loadGitignore } from "../utils/gitignoreFilter";

export class GrepTool extends BaseTool {
  constructor() {
    super('grep', 'Search for a regex pattern in a specific file or directory');
  }

  override toTool(): Tool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          required: ['pattern'],
          properties: {
            pattern: { type: 'string', description: 'The regex pattern to search for' },
            path: { type: 'string', description: 'The file or directory to search in (relative to cwd or absolute). If not provided, the current directory is used.' },
          },
        },
      },
    };
  }

  override async execute(args: Record<string, unknown>, ctx?: RunContext): Promise<string> {
    const patternStr = typeof args.pattern === "string" ? args.pattern : "";
    const rawPath =
      typeof args.path === "string" && args.path.length > 0 ? args.path : ctx?.sessionDir ?? homedir();
    const path = resolveToolFilePath(rawPath, ctx?.sessionDir);

    if (!patternStr) {
      return 'Error: missing pattern';
    }

    try {
      const regex = new RegExp(patternStr);

      let ig: Ignore | undefined = undefined;
      try {
        const stats = await fs.stat(path);
        if (stats.isDirectory()) {
          ig = await loadGitignore(path);
        }
      } catch {
        // path might be a file, that's fine
      }

      const results = await this.searchRecursive(path, regex, ig);
      
      if (results.length === 0) {
        return 'No matches found.';
      }
      
      return results.join('\n');
    } catch (e) {
      return 'Error: ' + (e as Error).message;
    }
  }

  private async searchFile(filePath: string, regex: RegExp): Promise<string[]> {
    const results: string[] = [];
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (regex.test(line)) {
        results.push(`${filePath}:${index + 1}: ${line.trim()}`);
      }
    });
    return results;
  }

  private async searchRecursive(currentPath: string, regex: RegExp, ig?: Ignore): Promise<string[]> {
    const results: string[] = [];
    try {
      const stats = await fs.stat(currentPath);

      if (stats.isFile()) {
        results.push(...await this.searchFile(currentPath, regex));
      } else if (stats.isDirectory()) {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = pathModule.join(currentPath, entry.name);
          
          if (ig && ig.ignores(entry.name)) {
            continue;
          }

          if (entry.isDirectory()) {
            const subResults = await this.searchRecursive(fullPath, regex, ig);
            results.push(...subResults);
          } else {
            results.push(...await this.searchFile(fullPath, regex));
          }
        }
      }
    } catch (e) {
      results.push(`Error reading ${currentPath}: ${(e as Error).message}`);
    }

    return results;
  }
}
