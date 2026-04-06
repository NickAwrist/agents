import { EventEmitter } from "events";
import { agentManager } from "../agents/agentManager";
import { RunContext, type Step } from "../RunContext";

export class AgentSession extends EventEmitter {
  public sessionId: string;
  public history: { role: string; content: string; steps?: Step[] }[] = [];
  private generalAgent: any;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
    // Instantiate the agent
    this.generalAgent = agentManager.createAgent("general_agent");
  }

  /** Rehydrate from client persistence (localStorage) after a server restart. */
  restoreFromPersistence(payload: {
    history: { role: string; content: string; steps?: Step[] }[];
    modelMessages?: Array<Record<string, unknown>>;
  }) {
    this.history = payload.history.map((h) => ({
      role: h.role,
      content: h.content,
      ...(h.steps != null ? { steps: h.steps } : {}),
    }));
    if (payload.modelMessages != null) {
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
      this.generalAgent.history = [];
    }
  }

  public async sendChat(prompt: string): Promise<string> {
    this.history.push({ role: "user", content: prompt });
    
    const ctx = new RunContext(this.generalAgent, prompt, (ctx, step) => {
      // Emit the step changing and the full array of steps up to now
      this.emit("step", {
        step: { ...step, agentName: ctx.agentName },
        steps: ctx.steps.map((s) => ({ ...s, agentName: ctx.agentName })),
      });
    });

    let result = "Error running agent.";
    try {
      const response = await this.generalAgent.run(prompt, ctx);
      if (response !== null) {
        result = response;
      }
    } catch (e) {
      console.error(`[AgentSession ${this.sessionId}] error:`, e);
      result = `Error: ${e instanceof Error ? e.message : String(e)}`;
      ctx.failStep(result);
    }

    this.history.push({ 
      role: "assistant", 
      content: result, 
      steps: [...ctx.steps] // Capture final steps array
    });

    return result;
  }

  /** Cumulative messages the agent keeps for the next Ollama call (user / assistant+tool_calls / tool). */
  getModelMessagesForDebug(): Array<Record<string, unknown>> {
    return this.generalAgent.history.map((msg: { role: string; content?: string; tool_calls?: unknown }) => {
      const row: Record<string, unknown> = { role: msg.role, content: msg.content ?? "" };
      if (msg.tool_calls != null) row.tool_calls = msg.tool_calls;
      return row;
    });
  }

  getSystemPromptForDebug(): string {
    return this.generalAgent.systemPrompt ?? "";
  }
}
