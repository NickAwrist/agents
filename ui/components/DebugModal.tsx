import { Bug, Loader2, X } from "lucide-react";
import type { DebugData } from "../types";
import { cx, debugBlock, eyebrowText, modalCloseButton, modalHeader, modalShell, modalSurface } from "../styles";

function formatModelMessages(data: DebugData): string {
  const msgs = data.modelMessages ?? [];
  const payload = [{ role: "system", content: data.systemPrompt }, ...msgs];
  return JSON.stringify(payload, null, 2);
}

export function DebugModal({ data, onClose }: { data: DebugData | null; onClose: () => void }) {
  return (
    <div className={modalShell} role="dialog" aria-modal="true" onClick={onClose}>
      <div className="relative max-h-[calc(100vh-32px)] w-full max-w-[960px]">
        <div className={modalSurface} onClick={(e) => e.stopPropagation()}>
          <div className={modalHeader}>
            <div>
              <div className={eyebrowText}>Internals</div>
              <h2 className="mt-1 flex items-center gap-2 text-[1.0625rem] font-semibold tracking-[-0.02em]">
                <Bug size={18} />
                Debug
              </h2>
            </div>
            <button type="button" onClick={onClose} className={modalCloseButton} aria-label="Close debug inspector">
              <X size={18} />
            </button>
          </div>

          {data ? (
            <div className="flex max-h-[min(70vh,640px)] flex-col overflow-y-auto px-[18px] pb-5 pt-4 sm:px-3.5 sm:pb-3.5 sm:pt-3.5">
              <p className="mb-4 text-[0.8125rem] leading-[1.6] text-muted-foreground">
                <strong>Session transcript</strong> is what the app stores (one user + one assistant turn per message, with trace metadata).{" "}
                <strong>Model payload</strong> is what the agent accumulates for Ollama: every user line, assistant replies (including{" "}
                <code className="rounded bg-muted px-[5px] py-px text-[0.75rem] text-foreground">tool_calls</code>), and{" "}
                <code className="rounded bg-muted px-[5px] py-px text-[0.75rem] text-foreground">tool</code> results. Steps are not separate model
                messages.
              </p>

              <section className="flex flex-col gap-2">
                <div className={eyebrowText}>System prompt (prepended every call)</div>
                <pre className={debugBlock}>{data.systemPrompt}</pre>
              </section>

              <section className="mt-[18px] flex flex-col gap-2">
                <div className={eyebrowText}>Model messages (cumulative, excludes system)</div>
                <pre className={cx(debugBlock, "max-h-[240px] overflow-auto text-[0.75rem] leading-[1.5]")}>
                  {JSON.stringify(data.modelMessages ?? [], null, 2)}
                </pre>
                {!data.modelMessages?.length && (
                  <p className="mb-2 text-[0.75rem] leading-[1.45] text-muted-foreground">
                    No turns yet — send a message to populate agent history (user / assistant / tool).
                  </p>
                )}
              </section>

              <section className="mt-[18px] flex flex-col gap-2">
                <div className={eyebrowText}>Full next-call shape (system + messages above)</div>
                <p className="mb-2 text-[0.75rem] leading-[1.45] text-muted-foreground">
                  The next user message is appended inside the agent loop when you send; this block shows system + current history only.
                </p>
                <pre className={cx(debugBlock, "max-h-[240px] overflow-auto text-[0.75rem] leading-[1.5]")}>{formatModelMessages(data)}</pre>
              </section>

              <section className="mt-[18px] flex flex-col gap-2">
                <div className={eyebrowText}>Session transcript (UI / persistence)</div>
                <div className="flex flex-col">
                  <div className="grid grid-cols-[100px_minmax(0,1fr)] items-start gap-[14px] border-b border-border-subtle pb-2 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground max-[640px]:hidden">
                    <span>Role</span>
                    <span>Content</span>
                  </div>
                  {data.history.map((entry, index) => (
                    <article
                      key={index}
                      className="grid grid-cols-[100px_minmax(0,1fr)] items-start gap-[14px] border-b border-border-subtle py-[14px] last:border-b-0 max-[640px]:grid-cols-1 max-[640px]:gap-2.5"
                    >
                      <div className="flex flex-col gap-1.5 pt-0.5">
                        <div className="w-fit rounded-md border border-border-subtle bg-muted px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.05em] text-foreground">
                          {entry.role}
                        </div>
                        <div className="text-[0.6875rem] text-muted-foreground">#{index + 1}</div>
                      </div>
                      <div className="flex min-w-0 flex-col gap-2">
                        <pre className={cx(debugBlock, "m-0 px-3 py-2.5 leading-[1.55]")}>{entry.content}</pre>
                        {entry.steps && entry.steps.length > 0 && (
                          <div className="text-[0.75rem] text-muted-foreground">
                            <span>{entry.steps.length} trace step(s) (not sent as chat messages)</span>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center gap-2.5 text-[0.875rem] text-muted-foreground">
              <Loader2 className="animate-spin" size={20} />
              Loading…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
