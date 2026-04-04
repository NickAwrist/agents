/** Pluggable hooks for live visibility into agent runs (tools, turns, LLM replies). All methods optional. */

export type AgentRunStartEvent = {
  queryId: string;
  userQuery: string;
  path: string;
  agentName: string;
  initialPrompt: string;
};

export type AgentTurnStartEvent = {
  queryId: string;
  path: string;
  turnIndex: number;
  userInput: string;
};

export type LlmResponseEvent = {
  queryId: string;
  path: string;
  turnIndex: number;
  content: string;
  toolCallNames: string[];
};

export type ToolCallStartEvent = {
  queryId: string;
  userQuery: string;
  path: string;
  turnIndex: number;
  toolCallIndex: number;
  toolName: string;
  args: Record<string, unknown>;
};

export type ToolCallEndEvent = {
  path: string;
  toolName: string;
  durationMs: number;
  resultPreview: string;
  error?: string;
};

export type AgentRunEndEvent = {
  queryId: string;
  path: string;
  agentName: string;
  finalTextPreview: string;
};

export interface AgentRuntimeObserver {
  onAgentRunStart?(e: AgentRunStartEvent): void;
  onAgentTurnStart?(e: AgentTurnStartEvent): void;
  onLlmResponse?(e: LlmResponseEvent): void;
  onToolCallStart?(e: ToolCallStartEvent): void;
  onToolCallEnd?(e: ToolCallEndEvent): void;
  onAgentRunEnd?(e: AgentRunEndEvent): void;
}

function preview(s: string, max = 240): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

/** Merge multiple observers (e.g. console + custom file writer). */
export function composeRuntimeObservers(
  ...parts: (AgentRuntimeObserver | undefined)[]
): AgentRuntimeObserver {
  const observers = parts.filter((o): o is AgentRuntimeObserver => o != null);
  return {
    onAgentRunStart: (e) => observers.forEach((o) => o.onAgentRunStart?.(e)),
    onAgentTurnStart: (e) => observers.forEach((o) => o.onAgentTurnStart?.(e)),
    onLlmResponse: (e) => observers.forEach((o) => o.onLlmResponse?.(e)),
    onToolCallStart: (e) => observers.forEach((o) => o.onToolCallStart?.(e)),
    onToolCallEnd: (e) => observers.forEach((o) => o.onToolCallEnd?.(e)),
    onAgentRunEnd: (e) => observers.forEach((o) => o.onAgentRunEnd?.(e)),
  };
}

/** stderr lines so REPL stdin/stdout stay readable. */
export function createConsoleRuntimeObserver(): AgentRuntimeObserver {
  const p = (line: string) => console.error(line);
  return {
    onAgentRunStart(e) {
      p(`[runtime] agent start ${e.agentName} path=${e.path} query=${preview(e.userQuery, 120)}`);
    },
    onAgentTurnStart(e) {
      p(`[runtime] turn ${e.turnIndex} @ ${e.path} user=${preview(e.userInput, 160)}`);
    },
    onLlmResponse(e) {
      const names = e.toolCallNames.length ? ` tools=[${e.toolCallNames.join(", ")}]` : "";
      p(`[runtime] llm @ ${e.path} turn=${e.turnIndex}${names} assistant=${preview(e.content, 200)}`);
    },
    onToolCallStart(e) {
      p(
        `[runtime] tool → ${e.toolName} @ ${e.path} #${e.toolCallIndex} args=${JSON.stringify(e.args)}`,
      );
    },
    onToolCallEnd(e) {
      const err = e.error ? ` ERROR=${e.error}` : "";
      p(
        `[runtime] tool ← ${e.toolName} @ ${e.path} ${e.durationMs}ms${err} result=${preview(e.resultPreview, 300)}`,
      );
    },
    onAgentRunEnd(e) {
      p(`[runtime] agent end ${e.agentName} @ ${e.path} final=${preview(e.finalTextPreview, 200)}`);
    },
  };
}
