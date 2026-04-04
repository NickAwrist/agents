import fs from "node:fs";
import path from "path";
import { getDefaultQueryLogDir } from "./persistQueryLog";
import type {
  AgentRunEndEvent,
  AgentRunStartEvent,
  AgentRuntimeObserver,
  AgentTurnStartEvent,
  LlmResponseEvent,
  ToolCallEndEvent,
  ToolCallStartEvent,
} from "./RuntimeObserver";

/** One NDJSON line per event under logs/queries/{queryId}.stream.ndjson (appendFileSync each time so it hits disk during the run). */
export function createStreamingFileRuntimeObserver(queryId: string): {
  observer: AgentRuntimeObserver;
  streamPath: string;
} {
  const dir = getDefaultQueryLogDir();
  fs.mkdirSync(dir, { recursive: true });
  const streamPath = path.resolve(path.join(dir, `${queryId}.stream.ndjson`));

  function emit(kind: string, payload: Record<string, unknown>): void {
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        kind,
        queryId,
        ...payload,
      }) + "\n";
    try {
      fs.appendFileSync(streamPath, line, "utf8");
    } catch (e) {
      console.error("[stream-log] append failed:", e);
    }
  }

  const observer: AgentRuntimeObserver = {
    onAgentRunStart(e: AgentRunStartEvent) {
      emit("agent_run_start", {
        path: e.path,
        agentName: e.agentName,
        userQuery: e.userQuery,
        initialPrompt: e.initialPrompt,
      });
    },
    onAgentTurnStart(e: AgentTurnStartEvent) {
      emit("agent_turn_start", {
        path: e.path,
        turnIndex: e.turnIndex,
        userInput: e.userInput,
      });
    },
    onLlmResponse(e: LlmResponseEvent) {
      emit("llm_response", {
        path: e.path,
        turnIndex: e.turnIndex,
        content: e.content,
        toolCallNames: e.toolCallNames,
      });
    },
    onToolCallStart(e: ToolCallStartEvent) {
      emit("tool_call_start", {
        path: e.path,
        turnIndex: e.turnIndex,
        toolCallIndex: e.toolCallIndex,
        toolName: e.toolName,
        args: e.args,
      });
    },
    onToolCallEnd(e: ToolCallEndEvent) {
      emit("tool_call_end", {
        path: e.path,
        toolName: e.toolName,
        durationMs: e.durationMs,
        resultPreview: e.resultPreview,
        error: e.error,
      });
    },
    onAgentRunEnd(e: AgentRunEndEvent) {
      emit("agent_run_end", {
        path: e.path,
        agentName: e.agentName,
        finalTextPreview: e.finalTextPreview,
      });
    },
  };

  return { observer, streamPath };
}
