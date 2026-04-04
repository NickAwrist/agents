import type { RunContext } from "../RunContext";
import type { BaseTool } from "../tools/BaseTool";
import ollama, { type ChatResponse, type ToolCall } from "ollama";

export class BaseAgent {
  model: string;
  systemPrompt?: string;
  name: string;
  description: string;
  tools: BaseTool[];
  history: Array<{ role: string; content: string }>;

  TOOL_MAP: Record<string, BaseTool>;

  constructor(name: string, description: string, tools?: BaseTool[], model?: string, systemPrompt?: string) {
    this.name = name;
    this.description = description;

    this.tools = tools || [];
    this.model = model || "gemma4:31b";
    this.systemPrompt = systemPrompt;

    this.history = [];

    this.TOOL_MAP = {};
  }

  addTool(tool: BaseTool): void {
    if (this.TOOL_MAP[tool.name]) {
      throw new Error(`Tool ${tool.name} already added`);
    }
    this.TOOL_MAP[tool.name] = tool;
    this.tools.push(tool);
  }

  addTools(tools: BaseTool[]): void {
    for (const tool of tools) {
      this.addTool(tool);
    }
  }

  private async executeToolCall(toolCall: ToolCall, ctx?: RunContext): Promise<string> {
    const toolName = toolCall.function.name;
    const args = this.parseToolArguments(toolCall.function.arguments);

    const tool = this.TOOL_MAP[toolName];
    if (!tool) {
      return "Error: tool " + toolName + " not found";
    }

    try {
      return await tool.execute(args, ctx);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  private parseToolArguments(raw: unknown): Record<string, unknown> {
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        /* ignore */
      }
      return {};
    }
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return {};
  }

  async run(prompt: string, ctx?: RunContext): Promise<string> {
    const systemMsg: { role: string; content: string } | undefined = this.systemPrompt
      ? { role: "system", content: this.systemPrompt }
      : undefined;

    let response: ChatResponse;
    let turnIndex = 0;

    do {
      ctx?.beginStep({ kind: "llm_call", turnIndex });

      response = await ollama.chat({
        model: this.model,
        messages: [
          systemMsg || { role: "system", content: "" },
          ...this.history,
          { role: "user", content: prompt },
        ],
        tools: this.tools.map((tool) => tool.toTool()),
        think: true,
      });

      const content = response.message.content ?? "";
      const thinking = response.message.thinking ?? "";
      const toolCalls = response.message.tool_calls ?? [];
      if (content) {
        ctx?.endStep(content, thinking || undefined);
      } else if (toolCalls.length) {
        ctx?.endStep("→ " + toolCalls.map((c) => c.function.name).join(", "), thinking || undefined);
      } else {
        ctx?.endStep("", thinking || undefined);
      }

      this.history.push({ role: "user", content: prompt });

      if (response.message.tool_calls?.length) {
        const toolResults: string[] = [];
        for (const toolCall of response.message.tool_calls) {
          const toolName = toolCall.function.name;
          const args = this.parseToolArguments(toolCall.function.arguments);

          ctx?.beginStep({ kind: "tool_call", turnIndex, toolName, args });
          const result = await this.executeToolCall(toolCall, ctx);
          ctx?.endStep(result);

          toolResults.push(`Result from tool call ${toolName}: ${result}`);
        }
        prompt = toolResults.join("\n");
        turnIndex++;
      }
    } while (response.message.tool_calls?.length);

    this.history.push({ role: "assistant", content: response.message.content });
    const finalText = response.message.content ?? "";
    const finalThinking = response.message.thinking ?? "";

    ctx?.beginStep({ kind: "complete", turnIndex });
    ctx?.endStep(finalText, finalThinking || undefined);

    return finalText;
  }
}
