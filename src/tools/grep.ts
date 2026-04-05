import type { Tool } from "ollama";
import { BaseTool } from "./BaseTool";
import fs from 'fs/promises';
import pathModule from 'path';
import ignore from 'ignore';

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

  override async execute(args: Record<string, unknown>): Promise<string> {
    const patternStr = typeof args.pattern === 'string' ? args.pattern : '';
    const path = typeof args.path === 'string' && args.path.length > 0 ? args.path : process.cwd();

    if (!patternStr) {
      return 'Error: missing pattern';
    }

    try {
      const regex = new RegExp(patternStr);
      
      // Load .gitignore from the search path if it's a directory
      let ig: ignore.Ignore | undefined = undefined;
      try {
        const stats = await fs.stat(path);
        if (stats.isDirectory()) {
          const gitignorePath = pathModule.join(path, '.gitignore');
          const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
          ig = ignore().add(gitignoreContent);
        }
      } catch (e) {
        // .gitignore might not exist or path might be a file
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

  private async searchRecursive(currentPath: string, regex: RegExp, ig?: ignore.Ignore): Promise<string[]> {
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
