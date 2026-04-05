import type { RunContext } from "../RunContext";
import type { BaseTool } from "../tools/BaseTool";
import ollama, { type ChatResponse, type ToolCall } from "ollama";
import { Plan } from "../Plan";

export class BaseAgent {
  model: string;
  systemPrompt?: string;
  name: string;
  description: string;
  tools: BaseTool[];
  history: Array<{ role: string; content: string }>;

  TOOL_MAP: Record<string, BaseTool>;

  plan?: Plan;

  constructor(name: string, description: string, tools?: BaseTool[], model?: string, systemPrompt?: string) {
    this.name = name;
    this.description = description;

    this.tools = tools || [];
    this.model = model || "gemma4:31b";
    const gemmaWarning = "CRITICAL INSTRUCTION: When calling tools, strictly output standard JSON. Do NOT use custom delimiters like <|\"|>. If an argument requires multiple lines (e.g. file contents or code), carefully escape your newlines with \\n, OR preferably use an array of strings if the tool provides a lines property.\n\nCRITICAL DIRECTIVE: You are an agent designed to take action. If you formulate a plan or decide on next steps, you MUST IMMEDIATELY use a tool call to execute the first step of your plan. NEVER stop your response after just outputting a plan or a thought. Your reply must almost always conclude with a tool call unless the entire task is fully completed.";
    this.systemPrompt = systemPrompt ? systemPrompt + "\n\n" + gemmaWarning : gemmaWarning;

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

      const messages = [
        systemMsg || { role: "system", content: "" },
        ...this.history,
      ];
      if (prompt) {
        messages.push({ role: "user", content: prompt });
      }

      response = await ollama.chat({
        model: this.model,
        messages,
        tools: this.tools.map((tool) => tool.toTool()),
        think: true,
      });

      const content = response.message.content ?? "";
      const thinking = response.message.thinking ?? "";
      const toolCalls = response.message.tool_calls ?? [];
      if (content && toolCalls.length) {
        const toolStr = "→ " + toolCalls.map((c) => c.function.name).join(", ");
        ctx?.endStep(content + "\n\n" + toolStr, thinking || undefined);
      } else if (content) {
        ctx?.endStep(content, thinking || undefined);
      } else if (toolCalls.length) {
        ctx?.endStep("→ " + toolCalls.map((c) => c.function.name).join(", "), thinking || undefined);
      } else {
        ctx?.endStep("", thinking || undefined);
      }

      if (prompt) {
        this.history.push({ role: "user", content: prompt });
        prompt = "";
      }

      const assistantMsg: any = { role: "assistant", content: response.message.content || "" };
      if (response.message.tool_calls && response.message.tool_calls.length > 0) {
        assistantMsg.tool_calls = response.message.tool_calls;
      }
      this.history.push(assistantMsg);

      if (response.message.tool_calls?.length) {
        for (const toolCall of response.message.tool_calls) {
          const toolName = toolCall.function.name;
          const args = this.parseToolArguments(toolCall.function.arguments);

          ctx?.beginStep({ kind: "tool_call", turnIndex, toolName, args });
          const result = await this.executeToolCall(toolCall, ctx);
          ctx?.endStep(result);

          this.history.push({ role: "tool", content: result });
        }
        prompt = "";
        turnIndex++;
      }
    } while (response.message.tool_calls?.length);
    const finalText = response.message.content ?? "";
    const finalThinking = response.message.thinking ?? "";

    ctx?.beginStep({ kind: "complete", turnIndex });
    ctx?.endStep(finalText, finalThinking || undefined);

    return finalText;
  }
}
