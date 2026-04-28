import type { ToolCall } from "ollama";
import type { Plan } from "../Plan";
import type { RunContext, Step } from "../RunContext";
import { DEFAULT_CHAT_MODEL } from "../constants";
import { logger } from "../logger";
import { getOllamaClient } from "../ollamaClient";
import { CORE_DIRECTIVES } from "../prompts/render";
import type { BaseTool } from "../tools/BaseTool";
import { toolErrorToString } from "../tools/errors";

const log = logger.child({ component: "BaseAgent" });

type AssistantHistoryMsg = {
  role: string;
  content: string;
  tool_calls?: ToolCall[];
};

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
  ) {
    this.name = name;
    this.description = description;

    this.tools = tools || [];
    this.model = model ?? DEFAULT_CHAT_MODEL;
    const base = typeof systemPrompt === "string" ? systemPrompt.trim() : "";
    this.systemPrompt = base
      ? `${base}\n\n${CORE_DIRECTIVES}`
      : CORE_DIRECTIVES;

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

  private async executeToolCall(
    toolCall: ToolCall,
    ctx?: RunContext,
    parentStep?: Step,
    turnIndex?: number,
  ): Promise<string> {
    const toolName = toolCall.function.name;
    const args = this.parseToolArguments(toolCall.function.arguments);
    const startedAt = Date.now();
    log.debug({
      event: "tool_call_start",
      toolName,
      agentName: ctx?.agentName,
      turnIndex,
    });

    const tool = this.TOOL_MAP[toolName];
    if (!tool) {
      log.debug({
        event: "tool_call_done",
        toolName,
        agentName: ctx?.agentName,
        turnIndex,
        runMs: Date.now() - startedAt,
      });
      return `Error: tool ${toolName} not found`;
    }

    try {
      return await tool.execute(args, ctx, parentStep);
    } catch (e) {
      return `Error: ${toolErrorToString(e, toolName, ctx?.sessionDir)}`;
    } finally {
      log.debug({
        event: "tool_call_done",
        toolName,
        agentName: ctx?.agentName,
        turnIndex,
        runMs: Date.now() - startedAt,
      });
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
    if (!ctx) {
      throw new Error("RunContext is required to run the agent");
    }
    const signal = ctx.signal;
    const systemMsg: { role: string; content: string } | undefined = this
      .systemPrompt
      ? { role: "system", content: this.systemPrompt }
      : undefined;

    let userMessage = prompt;
    let fullContent = "";
    let fullThinking = "";
    let toolCalls: ToolCall[] = [];
    let turnIndex = 0;

    do {
      if (signal?.aborted) break;

      const llmStep = ctx.beginStep({ kind: "llm_call", turnIndex });

      const messages = [
        systemMsg || { role: "system", content: "" },
        ...this.history,
      ];
      if (userMessage) {
        messages.push({ role: "user", content: userMessage });
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
            ctx.streamDelta(cDelta, tDelta);
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
        ctx.endStep(
          llmStep,
          fullContent || "[aborted]",
          fullThinking || undefined,
        );
        break;
      }

      if (fullContent && toolCalls.length) {
        const toolStr = `→ ${toolCalls.map((c) => c.function.name).join(", ")}`;
        ctx.endStep(
          llmStep,
          `${fullContent}\n\n${toolStr}`,
          fullThinking || undefined,
        );
      } else if (fullContent) {
        ctx.endStep(llmStep, fullContent, fullThinking || undefined);
      } else if (toolCalls.length) {
        ctx.endStep(
          llmStep,
          `→ ${toolCalls.map((c) => c.function.name).join(", ")}`,
          fullThinking || undefined,
        );
      } else {
        ctx.endStep(llmStep, "", fullThinking || undefined);
      }

      if (userMessage) {
        this.history.push({ role: "user", content: userMessage });
        userMessage = "";
      }

      const assistantMsg: AssistantHistoryMsg = {
        role: "assistant",
        content: fullContent,
      };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls;
      }
      this.history.push(assistantMsg);

      if (toolCalls.length) {
        for (const toolCall of toolCalls) {
          if (signal?.aborted) break;

          const toolName = toolCall.function.name;
          const args = this.parseToolArguments(toolCall.function.arguments);

          const toolStep = ctx.beginStep({
            kind: "tool_call",
            turnIndex,
            toolName,
            args,
          });
          const result = await this.executeToolCall(
            toolCall,
            ctx,
            toolStep,
            turnIndex,
          );
          ctx.endStep(toolStep, result);

          this.history.push({ role: "tool", content: result });
        }
        if (signal?.aborted) break;
        userMessage = "";
        turnIndex++;
      }
    } while (toolCalls.length);

    if (!signal?.aborted) {
      const completeStep = ctx.beginStep({ kind: "complete", turnIndex });
      ctx.endStep(completeStep, fullContent, fullThinking || undefined);
    }

    return fullContent;
  }
}
