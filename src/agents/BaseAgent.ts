import type { AgentRunLog, ToolContext, TurnLog } from "../logger/trace";
import { ToolInvocationLog } from "../logger/trace";
import type { BaseTool } from "../tools/BaseTool";
import ollama, { type ChatResponse, type ToolCall } from "ollama";

type ToolCallTraceCtx = {
  runLog: AgentRunLog;
  turn: TurnLog;
  turnIndex: number;
  toolCallIndex: number;
};

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

  private async executeToolCall(toolCall: ToolCall, traceCtx?: ToolCallTraceCtx): Promise<string> {
    const toolName = toolCall.function.name;
    const args = this.parseToolArguments(toolCall.function.arguments);

    let invocation: ToolInvocationLog | undefined;
    let toolCtx: ToolContext | undefined;
    let pathStr = "";

    if (traceCtx) {
      pathStr = `${traceCtx.runLog.path}/turn${traceCtx.turnIndex}/tool:${toolName}`;
      invocation = new ToolInvocationLog({
        originQueryId: traceCtx.runLog.queryId,
        userQuery: traceCtx.runLog.userQuery,
        path: pathStr,
        turnIndex: traceCtx.turnIndex,
        toolCallIndex: traceCtx.toolCallIndex,
        toolName,
        args,
      });
      traceCtx.turn.tools.push(invocation);
      toolCtx = {
        queryId: traceCtx.runLog.queryId,
        userQuery: traceCtx.runLog.userQuery,
        path: pathStr,
        turnIndex: traceCtx.turnIndex,
        toolCallIndex: traceCtx.toolCallIndex,
        invocation,
        observer: traceCtx.runLog.observer,
      };
      traceCtx.runLog.observer?.onToolCallStart?.({
        queryId: traceCtx.runLog.queryId,
        userQuery: traceCtx.runLog.userQuery,
        path: pathStr,
        turnIndex: traceCtx.turnIndex,
        toolCallIndex: traceCtx.toolCallIndex,
        toolName,
        args,
      });
    }

    const t0 = Date.now();
    const tool = this.TOOL_MAP[toolName];
    if (!tool) {
      const err = "Error: tool " + toolName + " not found";
      invocation?.end(err);
      traceCtx?.runLog.observer?.onToolCallEnd?.({
        path: pathStr,
        toolName,
        durationMs: Date.now() - t0,
        resultPreview: err,
        error: err,
      });
      return err;
    }

    let result: string;
    let execError: string | undefined;
    try {
      result = await tool.execute(args, toolCtx);
    } catch (e) {
      execError = e instanceof Error ? e.message : String(e);
      result = execError;
    }
    invocation?.end(result);
    traceCtx?.runLog.observer?.onToolCallEnd?.({
      path: pathStr,
      toolName,
      durationMs: Date.now() - t0,
      resultPreview: result,
      error: execError,
    });
    return result;
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

  async run(prompt: string, runLog?: AgentRunLog): Promise<string> {
    runLog?.observer?.onAgentRunStart?.({
      queryId: runLog.queryId,
      userQuery: runLog.userQuery,
      path: runLog.path,
      agentName: runLog.agentName,
      initialPrompt: prompt,
    });

    const systemMsg: { role: string; content: string } | undefined = this.systemPrompt
      ? { role: "system", content: this.systemPrompt }
      : undefined;

    let response: ChatResponse;
    let turnIndex = 0;

    do {
      const turn = runLog?.startTurn(turnIndex, prompt);

      runLog?.observer?.onAgentTurnStart?.({
        queryId: runLog.queryId,
        path: runLog.path,
        turnIndex,
        userInput: prompt,
      });

      response = await ollama.chat({
        model: this.model,
        messages: [
          systemMsg || { role: "system", content: "" },
          ...this.history,
          { role: "user", content: prompt },
        ],
        tools: this.tools.map((tool) => tool.toTool()),
      });

      turn?.recordAssistant(response.message.content ?? "", response.message.tool_calls);

      const toolCallNames =
        response.message.tool_calls?.map((c) => c.function.name) ?? [];
      runLog?.observer?.onLlmResponse?.({
        queryId: runLog.queryId,
        path: runLog.path,
        turnIndex,
        content: response.message.content ?? "",
        toolCallNames,
      });

      this.history.push({ role: "user", content: prompt });

      if (response.message.tool_calls?.length) {
        const toolResults: string[] = [];
        let i = 0;
        for (const toolCall of response.message.tool_calls) {
          const traceCtx =
            runLog && turn ? { runLog, turn, turnIndex, toolCallIndex: i } : undefined;
          const result = await this.executeToolCall(toolCall, traceCtx);
          toolResults.push(`Result from tool call ${toolCall.function.name}: ${result}`);
          i++;
        }
        prompt = toolResults.join("\n");
        turnIndex++;
      }
    } while (response.message.tool_calls?.length);

    this.history.push({ role: "assistant", content: response.message.content });
    const finalText = response.message.content ?? "";
    runLog?.complete(finalText);
    runLog?.observer?.onAgentRunEnd?.({
      queryId: runLog.queryId,
      path: runLog.path,
      agentName: runLog.agentName,
      finalTextPreview: finalText,
    });
    return finalText;
  }
}
