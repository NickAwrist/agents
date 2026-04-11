import type { MessageStep, TraceModalSelection } from "../../types";
import { traceStepsForDisplay } from "./normalizeTrace";

const TRACE_RESULT_SEP = "\n\n---\n\n";

/** All non-empty step `result` strings, depth-first (nested subagent runs after each step), matching the trace viewer filters. */
export function formatTraceResultsForCopy(steps: MessageStep[]): string {
  const out: string[] = [];

  function walk(level: MessageStep[]): void {
    for (const step of traceStepsForDisplay(level)) {
      const r = step.result?.trim();
      if (r) out.push(r);
      const nested = step.childRun?.steps;
      if (nested?.length) walk(nested);
    }
  }

  walk(steps ?? []);
  return out.join(TRACE_RESULT_SEP);
}

/** Steps fed into the trace modal while SSE is active. */
export function coalesceLiveTraceSteps(
  streamingSteps: MessageStep[],
  streamingStep: MessageStep | null,
): MessageStep[] {
  if (streamingSteps.length > 0) return streamingSteps;
  if (streamingStep) return [streamingStep];
  return [];
}

export function traceStepsForModal(
  stepsModalData: TraceModalSelection,
  streamingSteps: MessageStep[],
  streamingStep: MessageStep | null,
): MessageStep[] {
  if (stepsModalData === "live") return coalesceLiveTraceSteps(streamingSteps, streamingStep);
  if (stepsModalData == null) return [];
  return stepsModalData;
}

export function shouldShowStepsModal(
  stepsModalData: TraceModalSelection,
  streamingSteps: MessageStep[],
  streamingStep: MessageStep | null,
): boolean {
  if (stepsModalData == null) return false;
  return traceStepsForDisplay(traceStepsForModal(stepsModalData, streamingSteps, streamingStep)).length > 0;
}
