import type { Tool } from "ollama";
import { BaseTool } from "./BaseTool";
import fs from 'fs/promises';

export class DeleteFileTool extends BaseTool {
  constructor() {
    super('delete_file', 'Delete a file');
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
            path: { type: 'string', description: 'File path (relative to cwd or absolute)' },
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
    try {
      await fs.unlink(path);
      return 'File deleted at ' + path;
    } catch (e) {
      return 'Error: failed to delete file ' + path + ': ' + (e as Error).message;
    }
  }
}