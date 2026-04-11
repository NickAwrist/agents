import { useState } from "react";
import { Check, Copy, Search, X } from "lucide-react";
import type { MessageStep } from "../types";
import { copyTextToClipboard } from "../lib/copyTextToClipboard";
import { ExecutionTraceList, formatTraceResultsForCopy, traceStepsForDisplay } from "./ExecutionTrace";
import { cx, iconButton, modalCloseButton, modalHeader, modalShell, modalSurface, eyebrowText } from "../styles";

export { traceStepsForDisplay, formatTraceResultsForCopy } from "./ExecutionTrace";

export function StepsModal({
  steps,
  streamingThinking,
  onClose,
}: {
  steps: MessageStep[];
  streamingThinking?: string;
  onClose: () => void;
}) {
  const [resultsCopied, setResultsCopied] = useState(false);
  const traceCopyText = formatTraceResultsForCopy(steps ?? []);
  const canCopyResults = traceCopyText.length > 0;

  const copyResults = async () => {
    if (!canCopyResults) return;
    const ok = await copyTextToClipboard(traceCopyText);
    if (ok) {
      setResultsCopied(true);
      window.setTimeout(() => setResultsCopied(false), 1500);
    }
  };

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
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={!canCopyResults}
                onClick={() => void copyResults()}
                className={cx(iconButton, "disabled:pointer-events-none disabled:opacity-40")}
                title={resultsCopied ? "Copied" : "Copy trace results"}
                aria-label={resultsCopied ? "Copied" : "Copy trace results"}
              >
                {resultsCopied ? <Check size={18} /> : <Copy size={18} />}
              </button>
              <button onClick={onClose} className={modalCloseButton} aria-label="Close steps viewer">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-y-auto px-[18px] pb-5 pt-4 sm:px-3.5 sm:pb-3.5 sm:pt-3.5">
            <ExecutionTraceList steps={steps} streamingThinking={streamingThinking} />
          </div>
        </div>
      </div>
    </div>
  );
}
