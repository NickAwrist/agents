import type { MessageStep } from "../../types";

/** Fill missing per-step `agentName` inside nested runs (wire format has it; older snapshots may not). */
function normalizeMessageStep(step: MessageStep): MessageStep {
  const child = step.childRun;
  if (!child?.steps?.length) return step;
  const fallbackAgent = child.agentName;
  const steps = child.steps.map((s) => {
    const next = s.agentName || !fallbackAgent ? s : { ...s, agentName: fallbackAgent };
    return normalizeMessageStep(next);
  });
  return { ...step, childRun: { ...child, steps } };
}

function normalizeTraceSteps(steps: MessageStep[]): MessageStep[] {
  return steps.map(normalizeMessageStep);
}

/** `complete` steps mirror the final reply and add noise in the trace viewer. */
export function traceStepsForDisplay(steps: MessageStep[]): MessageStep[] {
  return normalizeTraceSteps(steps).filter((s) => s.kind !== "complete");
}
