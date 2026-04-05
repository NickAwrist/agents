import { SoftwareEngAgent } from "../agents/software_eng_agent";
import { BaseTool } from "./BaseTool";
import type { Tool } from "ollama";
import type { RunContext } from "../RunContext";

export class SoftwareEngAgentTool extends BaseTool {
  constructor() {
    super("software_eng_agent", "Call a software engineering agent to perform a complex programming or code-related task. It will be responsible for coming up with the necessary steps as well as the implementation.");
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

    const softwareEngAgent = new SoftwareEngAgent();
    // Providing a recognizable child context name
    const childCtx = ctx?.createChild(softwareEngAgent, task);
    return softwareEngAgent.run(task, childCtx);
  }
}
