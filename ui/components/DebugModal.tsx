import { Bug, Loader2, X } from "lucide-react";
import type { DebugData } from "../types";

export function DebugModal({ data, onClose }: { data: DebugData | null; onClose: () => void }) {
  return (
    <div className="modal-shell modal-shell--open" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel modal-panel--debug">
        <div className="modal-panel__backdrop" />
        <div className="modal-panel__surface" onClick={(e) => e.stopPropagation()}>
        <div className="modal-panel__header">
          <div>
            <div className="modal-panel__eyebrow">Raw internals</div>
            <h2>
              <Bug size={18} />
              Debug Inspector
            </h2>
          </div>
          <button onClick={onClose} className="modal-close-button" aria-label="Close debug inspector">
            <X size={18} />
          </button>
        </div>

        {data ? (
          <div className="modal-panel__content modal-panel__content--debug">
            <section className="debug-section">
              <div className="debug-section__label">System Prompt</div>
              <pre className="debug-block">{data.systemPrompt}</pre>
            </section>

            <section className="debug-section">
              <div className="debug-section__label">Raw History</div>
              <div className="debug-history-table">
                <div className="debug-history-table__head">
                  <span>Role</span>
                  <span>Entry</span>
                </div>
                {data.history.map((entry, index) => (
                  <article key={index} className="debug-history-row">
                    <div className="debug-history-row__rail">
                      <div className="debug-history__role">{entry.role}</div>
                      <div className="debug-history__index">#{index + 1}</div>
                    </div>
                    <div className="debug-history-row__body">
                      <pre className="debug-history-row__content">{entry.content}</pre>
                      <div className="debug-history-row__meta">
                        <div className="debug-history__count">{entry.steps ? `${entry.steps.length} step(s)` : "No steps"}</div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="modal-panel__loading">
            <Loader2 className="spin" size={20} />
            Loading debug data...
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
