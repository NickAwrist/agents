import type { MessageStep } from "../../types";
import { traceStepsForDisplay } from "./normalizeTrace";
import {
  coalesceLiveTraceSteps,
  formatTraceResultsForCopy,
  shouldShowStepsModal,
  traceStepsForModal,
} from "./traceModalLogic";
import { TraceStepBody } from "./TraceNodes";

export {
  traceStepsForDisplay,
  formatTraceResultsForCopy,
  coalesceLiveTraceSteps,
  traceStepsForModal,
  shouldShowStepsModal,
};

/** Numbered root-level trace (same layout for live SSE and persisted message steps). */
export function ExecutionTraceList({
  steps,
  streamingThinking,
}: {
  steps: MessageStep[];
  streamingThinking?: string;
}) {
  const displaySteps = traceStepsForDisplay(steps ?? []);
  const lastIdx = displaySteps.length - 1;
  return (
    <>
      {displaySteps.map((step, index) => (
        <TraceStepBody
          key={index}
          step={step}
          showIndex
          stepNumber={index + 1}
          streamingThinking={index === lastIdx ? streamingThinking : undefined}
        />
      ))}
    </>
  );
}
