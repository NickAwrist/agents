import { CodeDiscoveryAgent } from "../agents/code_discovery_agent";
import { BaseTool } from "./BaseTool";
import type { Tool } from "ollama";
import type { RunContext } from "../RunContext";

export class CodeDiscoveryAgentTool extends BaseTool {
  constructor() {
    super("code_discovery_agent", "CAn agent that helps find where a certain functionality is located in the codebase. If you do now know where a particular feature is, instead of listing all the files and reading each, just call this tool.");
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
                "The description of the functionality or code you are looking for. Ensure this is a simple text prompt. If you have long code snippets, use task_lines instead.",
            },
            task_lines: {
              type: "array",
              items: { type: "string" },
              description: "The description of the functionality or code you are looking for, split into an array of strings. Use this instead of 'task' if your prompt contains multiple lines or code.",
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

    const codeDiscoveryAgent = new CodeDiscoveryAgent();
    // Providing a recognizable child context name
    const childCtx = ctx?.createChild(codeDiscoveryAgent, task);
    return codeDiscoveryAgent.run(task, childCtx);
  }
}
