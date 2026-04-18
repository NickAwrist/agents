import type { Tool } from "ollama";
import type { RunContext, Step } from "../RunContext";
import { agentManager } from "../agents/agentManager";
import { BaseTool } from "./BaseTool";

export class AgentTool extends BaseTool {
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
              description:
                "The overall task to perform, split into an array of strings. Use this instead of 'task' if your prompt contains multiple lines or code.",
            },
          },
          required: [],
        },
      },
    };
  }

  override async execute(
    args: Record<string, unknown>,
    ctx?: RunContext,
    parentToolStep?: Step,
  ): Promise<string> {
    const task =
      typeof args.task === "string"
        ? args.task
        : Array.isArray(args.task_lines)
          ? args.task_lines.join("\n")
          : "";
    if (!task) return "Error: you must provide a task or task_lines";

    if (!ctx || !parentToolStep) {
      return "Error: missing context for sub-agent invocation";
    }
    const agent = agentManager.createAgentForContext(this.name, ctx);
    const childCtx = ctx.createChild(agent, task, parentToolStep);
    return agent.run(task, childCtx);
  }
}
