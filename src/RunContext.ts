import type { BaseAgent } from "./agents/BaseAgent";

export type StepStatus = "running" | "done" | "error";

export type Step = {
  kind: "llm_call" | "tool_call" | "complete" | "error";
  status: StepStatus;
  turnIndex: number;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: string;
  thinking?: string;
  error?: string;
  startedAt: string;
  endedAt?: string;
  childContext?: RunContext;
};

export type OnStepChange = (ctx: RunContext, step: Step) => void;
export type OnStreamDelta = (
  contentDelta: string,
  thinkingDelta: string,
  agentName: string,
) => void;

export class RunContext {
  agentInstance: BaseAgent;
  readonly agentName: string;
  readonly prompt: string;
  readonly signal?: AbortSignal;
  /** Resolved absolute directory for tools (session override or user home). */
  readonly sessionDir?: string;
  private _steps: Step[] = [];
  private _onChange?: OnStepChange;
  private _onStreamDelta?: OnStreamDelta;

  constructor(
    agentInstance: BaseAgent,
    prompt: string,
    onChange?: OnStepChange,
    onStreamDelta?: OnStreamDelta,
    signal?: AbortSignal,
    sessionDir?: string,
  ) {
    this.agentInstance = agentInstance;
    this.agentName = agentInstance.name;
    this.prompt = prompt;
    this._onChange = onChange;
    this._onStreamDelta = onStreamDelta;
    this.signal = signal;
    this.sessionDir = sessionDir;
  }

  /** Emit a streaming token delta for content and/or thinking. */
  streamDelta(contentDelta: string, thinkingDelta: string): void {
    this._onStreamDelta?.(contentDelta, thinkingDelta, this.agentName);
  }

  /** Begin a new step. Fires onChange. */
  beginStep(init: {
    kind: Step["kind"];
    turnIndex: number;
    toolName?: string;
    args?: Record<string, unknown>;
  }): Step {
    const step: Step = {
      kind: init.kind,
      status: "running",
      turnIndex: init.turnIndex,
      toolName: init.toolName,
      args: init.args,
      startedAt: new Date().toISOString(),
    };
    this._steps.push(step);
    this._onChange?.(this, step);
    return step;
  }

  /** End the given running step with a result. Fires onChange. */
  endStep(step: Step, result: string, thinking?: string): void {
    if (step.status !== "running" || !this._steps.includes(step)) return;
    step.status = "done";
    step.result = result;
    if (thinking) step.thinking = thinking;
    step.endedAt = new Date().toISOString();
    this._onChange?.(this, step);
  }

  /** Mark the given step as failed. Fires onChange. */
  failStep(step: Step, error: string): void {
    if (step.status !== "running" || !this._steps.includes(step)) return;
    step.status = "error";
    step.error = error;
    step.endedAt = new Date().toISOString();
    this._onChange?.(this, step);
  }

  /**
   * Error recovery when the caller did not keep a step handle (e.g. thrown from `run`).
   * Prefer explicit `failStep(step, …)` in new code.
   */
  failLastRunningStep(error: string): void {
    for (let i = this._steps.length - 1; i >= 0; i--) {
      const s = this._steps[i];
      if (s?.status === "running") {
        this.failStep(s, error);
        return;
      }
    }
  }

  /** Create a child RunContext for a nested agent, attached to `parentStep`. */
  createChild(
    agentInstance: BaseAgent,
    prompt: string,
    parentStep: Step,
  ): RunContext {
    const child = new RunContext(
      agentInstance,
      prompt,
      this._onChange,
      this._onStreamDelta,
      this.signal,
      this.sessionDir,
    );
    if (parentStep.status === "running") {
      parentStep.childContext = child;
    }
    return child;
  }

  /** The currently active step (last step with status "running"), or null. */
  get currentStep(): Step | null {
    for (let i = this._steps.length - 1; i >= 0; i--) {
      const s = this._steps[i];
      if (s && s.status === "running") return s;
    }
    return null;
  }

  /** All steps (completed + current). */
  get steps(): readonly Step[] {
    return this._steps;
  }

  /** JSON-serializable snapshot of the entire run tree. */
  snapshot(): Record<string, unknown> {
    return {
      agentName: this.agentName,
      prompt: this.prompt,
      steps: this._steps.map((s) => this._stepSnapshot(s)),
    };
  }

  private _stepBase(step: Step): Record<string, unknown> {
    const out: Record<string, unknown> = {
      kind: step.kind,
      status: step.status,
      turnIndex: step.turnIndex,
      startedAt: step.startedAt,
    };
    if (step.endedAt) out.endedAt = step.endedAt;
    if (step.toolName) out.toolName = step.toolName;
    if (step.args) out.args = step.args;
    if (step.result !== undefined) out.result = step.result;
    if (step.thinking !== undefined) out.thinking = step.thinking;
    if (step.error !== undefined) out.error = step.error;
    return out;
  }

  private _stepSnapshot(step: Step): Record<string, unknown> {
    const out = this._stepBase(step);
    if (step.childContext) out.childRun = step.childContext.snapshot();
    return out;
  }

  /** Plain JSON for SSE / UI; nested subagent runs under `childRun`. */
  wireStep(step: Step): Record<string, unknown> {
    const out = this._stepBase(step);
    out.agentName = this.agentName;
    if (step.childContext) {
      out.childRun = {
        agentName: step.childContext.agentName,
        prompt: step.childContext.prompt,
        steps: step.childContext.wireSteps(),
      };
    }
    return out;
  }

  wireSteps(): Record<string, unknown>[] {
    return this._steps.map((s) => this.wireStep(s));
  }
}
