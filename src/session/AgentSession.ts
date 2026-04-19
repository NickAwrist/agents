import { EventEmitter } from "node:events";
import { RunContext } from "../RunContext";
import type { BaseAgent } from "../agents/BaseAgent";
import { agentManager } from "../agents/agentManager";
import { logger } from "../logger";
import type { PromptContext } from "../prompts/render";

export type HistoryWireStep = Record<string, unknown>;

export type SessionMessage = {
  role: string;
  content: string;
  steps?: HistoryWireStep[];
};

export type SessionStepEvent = {
  step: HistoryWireStep;
  steps: HistoryWireStep[];
};

export type SessionStreamDeltaEvent = {
  contentDelta: string;
  thinkingDelta: string;
  agentName: string;
};

export type SessionAbortedEvent = {
  result: string;
  steps: HistoryWireStep[];
  history: SessionMessage[];
  modelMessages: Array<Record<string, unknown>> | null;
};

type SessionEvents = {
  step: SessionStepEvent;
  stream_delta: SessionStreamDeltaEvent;
  aborted: SessionAbortedEvent;
};

export type AgentSessionOptions = {
  model?: string;
  agentName?: string;
  /** Pre-rendered system prompt from the chat request. Takes precedence over `promptContext`. */
  systemPrompt?: string;
  /** Values for `{{PLACEHOLDERS}}` passed to subagents via `RunContext`. */
  promptContext?: PromptContext;
  toolSessionDir?: string;
};

export class AgentSession extends EventEmitter {
  public sessionId: string;
  public history: SessionMessage[] = [];
  private generalAgent: BaseAgent;
  private readonly toolSessionDir?: string;
  private readonly promptContext?: PromptContext;

  override on<K extends keyof SessionEvents>(
    event: K,
    listener: (payload: SessionEvents[K]) => void,
  ): this;
  override on(event: string, listener: (...args: unknown[]) => void): this;
  override on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof SessionEvents>(
    event: K,
    listener: (payload: SessionEvents[K]) => void,
  ): this;
  override off(event: string, listener: (...args: unknown[]) => void): this;
  override off(event: string, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  constructor(sessionId: string, options?: AgentSessionOptions) {
    super();
    this.sessionId = sessionId;
    this.toolSessionDir = options?.toolSessionDir;
    this.promptContext = options?.promptContext;
    const agentName = options?.agentName?.trim() || "general_agent";
    this.generalAgent = agentManager.createAgent(agentName, {
      systemPrompt: options?.systemPrompt,
      toolSessionDir: options?.toolSessionDir,
      promptContext: options?.promptContext,
    });
    const m = options?.model?.trim();
    if (m) this.generalAgent.model = m;
  }

  /** Rehydrate from the client request (history + optional Ollama message list). */
  restoreFromPersistence(payload: {
    history: { role: string; content: string; steps?: HistoryWireStep[] }[];
    modelMessages?: Array<Record<string, unknown>> | null;
  }) {
    this.history = payload.history.map((h) => ({
      role: h.role,
      content: h.content,
      ...(h.steps != null ? { steps: h.steps } : {}),
    }));
    if (Array.isArray(payload.modelMessages)) {
      type AgentHist = { role: string; content: string; tool_calls?: unknown };
      this.generalAgent.history = payload.modelMessages.map((m) => {
        const row: AgentHist = {
          role: typeof m.role === "string" ? m.role : "user",
          content: typeof m.content === "string" ? m.content : "",
        };
        if (m.tool_calls != null) row.tool_calls = m.tool_calls;
        return row as { role: string; content: string };
      });
    } else {
      this.generalAgent.history = payload.history.map((h) => ({
        role: typeof h.role === "string" ? h.role : "user",
        content: typeof h.content === "string" ? h.content : "",
      }));
    }
  }

  public async sendChat(prompt: string, signal?: AbortSignal): Promise<string> {
    this.history.push({ role: "user", content: prompt });

    const ctx = new RunContext(
      this.generalAgent,
      prompt,
      (ctx, step) => {
        this.emit("step", {
          step: ctx.wireStep(step),
          steps: ctx.wireSteps(),
        });
      },
      (contentDelta, thinkingDelta, agentName) => {
        this.emit("stream_delta", { contentDelta, thinkingDelta, agentName });
      },
      signal,
      this.toolSessionDir,
      this.promptContext,
    );

    let result = "Error running agent.";
    let aborted = false;
    try {
      const response = await this.generalAgent.run(prompt, ctx);
      if (signal?.aborted) {
        aborted = true;
        result = response || "";
      } else if (response !== null) {
        result = response;
      }
    } catch (e) {
      if (signal?.aborted) {
        aborted = true;
        result = "";
      } else {
        logger.error(
          { err: e, sessionId: this.sessionId },
          "AgentSession error",
        );
        result = `Error: ${e instanceof Error ? e.message : String(e)}`;
        ctx.failLastRunningStep(result);
      }
    }

    this.history.push({
      role: "assistant",
      content: result,
      steps: ctx.wireSteps(),
    });

    if (aborted) {
      this.emit("aborted", {
        result,
        steps: ctx.wireSteps(),
        history: this.history,
        modelMessages: this.getModelMessages(),
      });
    }

    return result;
  }

  /** Cumulative messages the agent keeps for the next Ollama call. */
  getModelMessages(): Array<Record<string, unknown>> {
    return this.generalAgent.history.map(
      (msg: { role: string; content?: string; tool_calls?: unknown }) => {
        const row: Record<string, unknown> = {
          role: msg.role,
          content: msg.content ?? "",
        };
        if (msg.tool_calls != null) row.tool_calls = msg.tool_calls;
        return row;
      },
    );
  }
}
