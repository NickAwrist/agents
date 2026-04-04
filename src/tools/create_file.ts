import type { Tool } from "ollama";
import { BaseTool } from "./BaseTool";
import fs from 'fs/promises';

export class CreateFileTool extends BaseTool {
  constructor() {
    super('create_file', 'Create a new file');
  }

  override toTool(): Tool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          required: ['path', 'content'],
          properties: {
            path: { type: 'string', description: 'File path (relative to cwd or absolute)' },
            content: { type: 'string', description: 'File contents' },
          },
        },
      },
    };
  }

  override async execute(args: Record<string, unknown>): Promise<string> {
    const path =
      typeof args.path === 'string' && args.path.length > 0
        ? args.path
        : typeof args.filename === 'string' && args.filename.length > 0
            ? args.filename
            : '';
    if (!path) {
      return 'Error: missing path (provide path or filename)';
    }
    const content =
      typeof args.content === 'string' ? args.content : '';
    await fs.writeFile(path, content);
    return 'File created at ' + path;
  }
}