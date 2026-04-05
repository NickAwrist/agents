import { ComputerAgent } from "../agents/computer_agent";
import { BaseTool } from "./BaseTool";
import type { Tool } from "ollama";
import type { RunContext } from "../RunContext";

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
                "The overall task to perform. Ensure this is a simple text prompt. If you have long code snippets, use task_lines instead.",
            },
            task_lines: {
              type: "array",
              items: { type: "string" },
              description: "The overall task to perform, split into an array of strings. Use this instead of 'task' if your prompt contains multiple lines or code.",
            },
          },
          required: [],
        },
      },
    };
  }

  override async execute(args: Record<string, unknown>, ctx?: RunContext): Promise<string> {
    const task = typeof args.task === "string"
      ? args.task
      : Array.isArray(args.task_lines)
        ? args.task_lines.join("\n")
        : "";
    if (!task) return "Error: you must provide a task or task_lines";

    const computerAgent = new ComputerAgent();
    const childCtx = ctx?.createChild(computerAgent, task);
    return computerAgent.run(task, childCtx);
  }
}

