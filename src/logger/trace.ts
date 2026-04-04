import type { ToolCall } from "ollama";
import type { AgentRuntimeObserver } from "./RuntimeObserver";

const DEFAULT_MAX_RESULT_JSON_CHARS = 50_000;

export type ToolContext = {
  queryId: string;
  userQuery: string;
  path: string;
  turnIndex: number;
  toolCallIndex: number;
  invocation: ToolInvocationLog;
  observer?: AgentRuntimeObserver;
};

export class ToolInvocationLog {
  readonly originQueryId: string;
  readonly userQuery: string;
  readonly path: string;
  readonly turnIndex: number;
  readonly toolCallIndex: number;
  toolName: string;
  args: Record<string, unknown>;
  result = "";
  readonly startedAt: Date;
  endedAt: Date;
  nestedRun?: AgentRunLog;

  constructor(fields: {
    originQueryId: string;
    userQuery: string;
    path: string;
    turnIndex: number;
    toolCallIndex: number;
    toolName: string;
    args: Record<string, unknown>;
  }) {
    this.originQueryId = fields.originQueryId;
    this.userQuery = fields.userQuery;
    this.path = fields.path;
    this.turnIndex = fields.turnIndex;
    this.toolCallIndex = fields.toolCallIndex;
    this.toolName = fields.toolName;
    this.args = fields.args;
    this.startedAt = new Date();
    this.endedAt = this.startedAt;
  }

  end(result: string): void {
    this.result = result;
    this.endedAt = new Date();
  }

  beginNestedAgent(agentName: string, observer?: AgentRuntimeObserver): AgentRunLog {
    const childPath = `${this.path}/${agentName}`;
    const run = new AgentRunLog({
      queryId: this.originQueryId,
      userQuery: this.userQuery,
      path: childPath,
      agentName,
      observer,
    });
    this.nestedRun = run;
    return run;
  }

  toJSON(maxResultChars = DEFAULT_MAX_RESULT_JSON_CHARS): Record<string, unknown> {
    return {
      originQueryId: this.originQueryId,
      userQuery: this.userQuery,
      path: this.path,
      turnIndex: this.turnIndex,
      toolCallIndex: this.toolCallIndex,
      toolName: this.toolName,
      args: this.args,
      result: truncateForJson(this.result, maxResultChars),
      startedAt: this.startedAt.toISOString(),
      endedAt: this.endedAt.toISOString(),
      nestedRun: this.nestedRun?.toJSON(maxResultChars),
    };
  }
}

export class TurnLog {
  readonly turnIndex: number;
  userInput: string;
  assistantContent = "";
  toolCallsRaw: ToolCall[] | undefined;
  readonly tools: ToolInvocationLog[] = [];

  constructor(turnIndex: number, userInput: string) {
    this.turnIndex = turnIndex;
    this.userInput = userInput;
  }

  recordAssistant(content: string, toolCalls: ToolCall[] | undefined): void {
    this.assistantContent = content;
    this.toolCallsRaw = toolCalls;
  }

  toJSON(maxResultChars: number): Record<string, unknown> {
    return {
      turnIndex: this.turnIndex,
      userInput: this.userInput,
      assistantContent: this.assistantContent,
      toolCallsRaw: this.toolCallsRaw,
      tools: this.tools.map((t) => t.toJSON(maxResultChars)),
    };
  }
}

export class AgentRunLog {
  readonly queryId: string;
  readonly userQuery: string;
  readonly path: string;
  readonly agentName: string;
  readonly observer?: AgentRuntimeObserver;
  readonly startedAt: Date;
  endedAt: Date;
  readonly turns: TurnLog[] = [];
  finalText = "";

  constructor(fields: {
    queryId: string;
    userQuery: string;
    path: string;
    agentName: string;
    observer?: AgentRuntimeObserver;
  }) {
    this.queryId = fields.queryId;
    this.userQuery = fields.userQuery;
    this.path = fields.path;
    this.agentName = fields.agentName;
    this.observer = fields.observer;
    this.startedAt = new Date();
    this.endedAt = this.startedAt;
  }

  startTurn(turnIndex: number, userInput: string): TurnLog {
    const turn = new TurnLog(turnIndex, userInput);
    this.turns.push(turn);
    return turn;
  }

  complete(finalText: string): void {
    this.finalText = finalText;
    this.endedAt = new Date();
  }

  toJSON(maxResultChars = DEFAULT_MAX_RESULT_JSON_CHARS): Record<string, unknown> {
    return {
      queryId: this.queryId,
      userQuery: this.userQuery,
      path: this.path,
      agentName: this.agentName,
      startedAt: this.startedAt.toISOString(),
      endedAt: this.endedAt.toISOString(),
      finalText: truncateForJson(this.finalText, maxResultChars),
      turns: this.turns.map((t) => t.toJSON(maxResultChars)),
    };
  }
}

function truncateForJson(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + `… [truncated ${s.length - maxChars} chars]`;
}
