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

  public async sendChat(prompt: string): Promise<string> {
    this.history.push({ role: "user", content: prompt });
    
    const ctx = new RunContext(this.generalAgent, prompt, (ctx, step) => {
      // Emit the step changing and the full array of steps up to now
      this.emit("step", { step, steps: [...ctx.steps] });
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
}
