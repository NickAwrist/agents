import type { RunContext } from "../RunContext";
import type { BaseTool } from "../tools/BaseTool";
import type { ToolCall } from "ollama";
import { getOllamaClient } from "../ollamaClient";
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

  constructor(
    name: string,
    description: string,
    tools?: BaseTool[],
    model?: string,
    systemPrompt?: string,
    personalizationBlock?: string | null,
    sessionContextBlock?: string | null,
    osContextBlock?: string | null,
  ) {
    this.name = name;
    this.description = description;

    this.tools = tools || [];
    this.model = model || "gemma4:31b";
    const gemmaWarning = "CRITICAL INSTRUCTION: When calling tools, strictly output standard JSON. Do NOT use custom delimiters like <|\"|>. If an argument requires multiple lines (e.g. file contents or code), carefully escape your newlines with \\n, OR preferably use an array of strings if the tool provides a lines property.\n\nCRITICAL DIRECTIVE: You are an agent designed to take action. If you formulate a plan or decide on next steps, you MUST IMMEDIATELY use a tool call to execute the first step of your plan. NEVER stop your response after just outputting a plan or a thought. Your reply must almost always conclude with a tool call unless the entire task is fully completed.";
    const base = typeof systemPrompt === "string" ? systemPrompt.trim() : "";
    const p = typeof personalizationBlock === "string" ? personalizationBlock.trim() : "";
    const sd = typeof sessionContextBlock === "string" ? sessionContextBlock.trim() : "";
    const oi = typeof osContextBlock === "string" ? osContextBlock.trim() : "";
    const core = [base, p, sd, oi].filter((s) => s.length > 0).join("\n\n");
    this.systemPrompt = core ? core + "\n\n" + gemmaWarning : gemmaWarning;

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
    const signal = ctx?.signal;
    const systemMsg: { role: string; content: string } | undefined = this.systemPrompt
      ? { role: "system", content: this.systemPrompt }
      : undefined;

    let fullContent = "";
    let fullThinking = "";
    let toolCalls: ToolCall[] = [];
    let turnIndex = 0;

    do {
      if (signal?.aborted) break;

      ctx?.beginStep({ kind: "llm_call", turnIndex });

      const messages = [
        systemMsg || { role: "system", content: "" },
        ...this.history,
      ];
      if (prompt) {
        messages.push({ role: "user", content: prompt });
      }

      const thinkOpt =
        /gemma/i.test(this.model) || /qwen3/i.test(this.model)
          ? ({ think: true as const } satisfies { think: true })
          : {};

      fullContent = "";
      fullThinking = "";
      toolCalls = [];

      const stream = await getOllamaClient().chat({
        model: this.model,
        messages,
        tools: this.tools.map((tool) => tool.toTool()),
        stream: true,
        ...thinkOpt,
      });

      const onAbort = () => stream.abort();
      if (signal?.aborted) {
        stream.abort();
      } else {
        signal?.addEventListener("abort", onAbort, { once: true });
      }

      try {
        for await (const chunk of stream) {
          if (signal?.aborted) break;

          const cDelta = chunk.message.content ?? "";
          const tDelta = chunk.message.thinking ?? "";

          if (cDelta) fullContent += cDelta;
          if (tDelta) fullThinking += tDelta;

          if (cDelta || tDelta) {
            ctx?.streamDelta(cDelta, tDelta);
          }

          if (chunk.message.tool_calls?.length) {
            toolCalls = chunk.message.tool_calls;
          }
        }
      } catch (e) {
        if (!signal?.aborted) throw e;
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }

      if (signal?.aborted) {
        ctx?.endStep(fullContent || "[aborted]", fullThinking || undefined);
        break;
      }

      if (fullContent && toolCalls.length) {
        const toolStr = "→ " + toolCalls.map((c) => c.function.name).join(", ");
        ctx?.endStep(fullContent + "\n\n" + toolStr, fullThinking || undefined);
      } else if (fullContent) {
        ctx?.endStep(fullContent, fullThinking || undefined);
      } else if (toolCalls.length) {
        ctx?.endStep("→ " + toolCalls.map((c) => c.function.name).join(", "), fullThinking || undefined);
      } else {
        ctx?.endStep("", fullThinking || undefined);
      }

      if (prompt) {
        this.history.push({ role: "user", content: prompt });
        prompt = "";
      }

      const assistantMsg: any = { role: "assistant", content: fullContent };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls;
      }
      this.history.push(assistantMsg);

      if (toolCalls.length) {
        for (const toolCall of toolCalls) {
          if (signal?.aborted) break;

          const toolName = toolCall.function.name;
          const args = this.parseToolArguments(toolCall.function.arguments);

          ctx?.beginStep({ kind: "tool_call", turnIndex, toolName, args });
          const result = await this.executeToolCall(toolCall, ctx);
          ctx?.endStep(result);

          this.history.push({ role: "tool", content: result });
        }
        if (signal?.aborted) break;
        prompt = "";
        turnIndex++;
      }
    } while (toolCalls.length);

    if (!signal?.aborted) {
      ctx?.beginStep({ kind: "complete", turnIndex });
      ctx?.endStep(fullContent, fullThinking || undefined);
    }

    return fullContent;
  }
}
