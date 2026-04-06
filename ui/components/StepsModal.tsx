import { Search, Wrench, X } from "lucide-react";
import type { MessageStep } from "../types";
import { cx, debugBlock, eyebrowText, modalCloseButton, modalHeader, modalShell, modalSurface } from "../styles";

export function StepsModal({ steps, onClose }: { steps: MessageStep[]; onClose: () => void }) {
  if (!steps || steps.length === 0) return null;

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
            {steps.map((step, index) => (
              <section key={index} className="border-b border-border-subtle py-[14px] last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex size-[26px] items-center justify-center rounded-md bg-muted text-[0.6875rem] font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="rounded-md bg-muted px-2 py-[3px] text-[0.6875rem] font-medium text-muted-foreground">
                    {step.kind}
                  </span>
                  {step.toolName && (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-[3px] text-[0.6875rem] font-medium text-muted-foreground">
                      <Wrench size={12} />
                      {step.toolName}
                    </span>
                  )}
                </div>

                {step.thinking && <div className="mt-2 whitespace-pre-wrap text-[0.875rem] leading-[1.6] text-foreground">{step.thinking}</div>}

                {step.args && (
                  <div className="mt-2.5">
                    <div className={eyebrowText}>Arguments</div>
                    <pre className={cx(debugBlock, "mt-1.5 text-[0.8125rem] leading-[1.5] text-muted-foreground")}>
                      {JSON.stringify(step.args, null, 2)}
                    </pre>
                  </div>
                )}

                {step.result && (
                  <div className="mt-2.5">
                    <div className={eyebrowText}>Result</div>
                    <pre className={cx(debugBlock, "mt-1.5 text-[0.8125rem] leading-[1.5] text-muted-foreground")}>{step.result}</pre>
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
