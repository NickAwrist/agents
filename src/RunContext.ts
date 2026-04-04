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

export class RunContext {
  readonly agentName: string;
  readonly prompt: string;
  private _steps: Step[] = [];
  private _onChange?: OnStepChange;

  constructor(agentName: string, prompt: string, onChange?: OnStepChange) {
    this.agentName = agentName;
    this.prompt = prompt;
    this._onChange = onChange;
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

  /** End the current (last running) step with a result. Fires onChange. */
  endStep(result: string, thinking?: string): void {
    const step = this._lastRunning();
    if (!step) return;
    step.status = "done";
    step.result = result;
    if (thinking) step.thinking = thinking;
    step.endedAt = new Date().toISOString();
    this._onChange?.(this, step);
  }

  /** End the current step as an error. Fires onChange. */
  failStep(error: string): void {
    const step = this._lastRunning();
    if (!step) return;
    step.status = "error";
    step.error = error;
    step.endedAt = new Date().toISOString();
    this._onChange?.(this, step);
  }

  /** Create a child RunContext for a nested agent, attached to the current step. */
  createChild(agentName: string, prompt: string): RunContext {
    const child = new RunContext(agentName, prompt, this._onChange);
    const step = this._lastRunning();
    if (step) {
      step.childContext = child;
    }
    return child;
  }

  /** The currently active step (last step with status "running"), or null. */
  get currentStep(): Step | null {
    return this._lastRunning();
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

  private _lastRunning(): Step | null {
    for (let i = this._steps.length - 1; i >= 0; i--) {
      const s = this._steps[i];
      if (s && s.status === "running") return s;
    }
    return null;
  }

  private _stepSnapshot(step: Step): Record<string, unknown> {
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
    if (step.childContext) out.childRun = step.childContext.snapshot();
    return out;
  }
}
