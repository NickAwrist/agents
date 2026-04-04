import { ComputerAgent } from "../agents/computer_agent";
import { AgentLog } from "../logger/AgentLog";
import { BaseTool } from "./BaseTool";
import type { Tool } from "ollama";

export class ComputerAgentTool extends BaseTool {
  constructor() {
    super('computer_agent', 'Call a computer agent to perform a complex task that pertains to the computer');
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
            task: { type: 'string', description: 'The overall task to perform. This should be a detailed description of the task to perform.' },
          },
          required: ['task'],
        },
      },
    };
  }

  override async execute(args: Record<string, unknown>): Promise<string> {
    const computerAgent = new ComputerAgent();
    const result = await computerAgent.run(args.task as string);
    return result.getResponse();
  }
}