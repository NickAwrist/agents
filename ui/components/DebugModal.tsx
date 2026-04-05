import { Bug, Loader2, X } from "lucide-react";
import type { DebugData } from "../types";

function formatModelMessages(data: DebugData): string {
  const msgs = data.modelMessages ?? [];
  const payload = [{ role: "system", content: data.systemPrompt }, ...msgs];
  return JSON.stringify(payload, null, 2);
}

export function DebugModal({ data, onClose }: { data: DebugData | null; onClose: () => void }) {
  return (
    <div className="modal-shell modal-shell--open" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel modal-panel--debug">
        <div className="modal-panel__backdrop" />
        <div className="modal-panel__surface" onClick={(e) => e.stopPropagation()}>
          <div className="modal-panel__header">
            <div>
              <div className="modal-panel__eyebrow">Internals</div>
              <h2>
                <Bug size={18} />
                Debug
              </h2>
            </div>
            <button type="button" onClick={onClose} className="modal-close-button" aria-label="Close debug inspector">
              <X size={18} />
            </button>
          </div>

          {data ? (
            <div className="modal-panel__content modal-panel__content--debug">
              <p className="debug-intro">
                <strong>Session transcript</strong> is what the app stores (one user + one assistant turn per message, with trace metadata).{" "}
                <strong>Model payload</strong> is what the agent accumulates for Ollama: every user line, assistant replies (including{" "}
                <code>tool_calls</code>), and <code>tool</code> results. Steps are not separate model messages.
              </p>

              <section className="debug-section">
                <div className="debug-section__label">System prompt (prepended every call)</div>
                <pre className="debug-block">{data.systemPrompt}</pre>
              </section>

              <section className="debug-section">
                <div className="debug-section__label">Model messages (cumulative, excludes system)</div>
                <pre className="debug-block debug-block--json">{JSON.stringify(data.modelMessages ?? [], null, 2)}</pre>
                {!data.modelMessages?.length && (
                  <p className="debug-footnote">No turns yet — send a message to populate agent history (user / assistant / tool).</p>
                )}
              </section>

              <section className="debug-section">
                <div className="debug-section__label">Full next-call shape (system + messages above)</div>
                <p className="debug-footnote">The next user message is appended inside the agent loop when you send; this block shows system + current history only.</p>
                <pre className="debug-block debug-block--json">{formatModelMessages(data)}</pre>
              </section>

              <section className="debug-section">
                <div className="debug-section__label">Session transcript (UI / persistence)</div>
                <div className="debug-history-table">
                  <div className="debug-history-table__head">
                    <span>Role</span>
                    <span>Content</span>
                  </div>
                  {data.history.map((entry, index) => (
                    <article key={index} className="debug-history-row">
                      <div className="debug-history-row__rail">
                        <div className="debug-history__role">{entry.role}</div>
                        <div className="debug-history__index">#{index + 1}</div>
                      </div>
                      <div className="debug-history-row__body">
                        <pre className="debug-history-row__content">{entry.content}</pre>
                        {entry.steps && entry.steps.length > 0 && (
                          <div className="debug-history-row__meta">
                            <span className="debug-history__count">{entry.steps.length} trace step(s) (not sent as chat messages)</span>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="modal-panel__loading">
              <Loader2 className="spin" size={20} />
              Loading…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
