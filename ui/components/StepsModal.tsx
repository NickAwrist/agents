import { Search, Wrench, X } from "lucide-react";
import type { MessageStep } from "../types";

export function StepsModal({ steps, onClose }: { steps: MessageStep[]; onClose: () => void }) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="modal-shell modal-shell--open" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel modal-panel--steps">
        <div className="modal-panel__backdrop" />
        <div className="modal-panel__surface" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel__header">
          <div>
            <div className="modal-panel__eyebrow">Execution trace</div>
            <h2>
              <Search size={18} />
              Agent Steps
            </h2>
          </div>
          <button onClick={onClose} className="modal-close-button" aria-label="Close steps viewer">
            <X size={18} />
          </button>
        </div>

        <div className="modal-panel__content modal-panel__content--steps">
          {steps.map((step, index) => (
            <section key={index} className="step-row">
              <div className="step-row__top">
                <div className="step-row__left">
                  <span className="step-card__index">{index + 1}</span>
                  <span className="step-tag">{step.kind}</span>
                  {step.toolName && (
                    <span className="step-tool">
                      <Wrench size={12} />
                      {step.toolName}
                    </span>
                  )}
                </div>
              </div>

              {step.thinking && <div className="step-text">{step.thinking}</div>}

              {step.args && (
                <div className="step-plain">
                  <div className="step-block__label">Arguments</div>
                  <pre>{JSON.stringify(step.args, null, 2)}</pre>
                </div>
              )}

              {step.result && (
                <div className="step-plain">
                  <div className="step-block__label">Result</div>
                  <pre>{step.result}</pre>
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
