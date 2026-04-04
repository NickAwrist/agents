import type { Tool } from "ollama";

export class BaseTool {
  name: string;
  description: string;

  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
  }

  async execute(args: Record<string, unknown>): Promise<string> {
    throw new Error('Tool not implemented');
  }

  toTool(): Tool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
      },
    };
  }
}