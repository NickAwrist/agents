import { Search, X } from "lucide-react";
import type { MessageStep } from "../types";
import { ExecutionTraceList, traceStepsForDisplay } from "./ExecutionTrace";
import { modalCloseButton, modalHeader, modalShell, modalSurface, eyebrowText } from "../styles";

export { traceStepsForDisplay } from "./ExecutionTrace";

export function StepsModal({ steps, onClose }: { steps: MessageStep[]; onClose: () => void }) {
  if (traceStepsForDisplay(steps ?? []).length === 0) return null;

  return (
    <div className={modalShell} role="dialog" aria-modal="true" onClick={onClose}>
      <div className="relative max-h-[calc(100vh-32px)] w-full max-w-[42rem]">
        <div className={modalSurface} onClick={(e) => e.stopPropagation()}>
          <div className={modalHeader}>
            <div>
              <div className={eyebrowText}>Execution trace</div>
              <h2 className="mt-1 flex items-center gap-2 text-[1.0625rem] font-semibold tracking-[-0.02em]">
                <Search size={18} />
                Agent Steps
              </h2>
            </div>
            <button onClick={onClose} className={modalCloseButton} aria-label="Close steps viewer">
              <X size={18} />
            </button>
          </div>

          <div className="flex min-h-0 flex-col overflow-y-auto px-[18px] pb-5 pt-4 sm:px-3.5 sm:pb-3.5 sm:pt-3.5">
            <ExecutionTraceList steps={steps} />
          </div>
        </div>
      </div>
    </div>
  );
}
