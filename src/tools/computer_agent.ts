import { ComputerAgent } from "../agents/computer_agent";
import { BaseTool } from "./BaseTool";
import type { Tool } from "ollama";
import type { ToolContext } from "../logger/trace";

export class ComputerAgentTool extends BaseTool {
  constructor() {
    super("computer_agent", "Call a computer agent to perform a complex task that pertains to the computer");
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
            task: {
              type: "string",
              description:
                "The overall task to perform. This should be a detailed description of the task to perform.",
            },
          },
          required: ["task"],
        },
      },
    };
  }

  override async execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<string> {
    const task = typeof args.task === "string" ? args.task : "";
    const computerAgent = new ComputerAgent();
    if (ctx) {
      const nestedRun = ctx.invocation.beginNestedAgent("ComputerAgent", ctx.observer);
      return computerAgent.run(task, nestedRun);
    }
    return computerAgent.run(task);
  }
}
