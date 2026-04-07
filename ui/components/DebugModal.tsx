import { Bug, Loader2, X } from "lucide-react";
import type { DebugData } from "../types";
import { cx, debugBlock, eyebrowText, modalCloseButton, modalHeader, modalShell, modalSurface } from "../styles";

function nextCallPayload(data: DebugData): string {
  const msgs = data.modelMessages ?? [];
  const payload = [{ role: "system", content: data.systemPrompt }, ...msgs];
  return JSON.stringify(payload, null, 2);
}

export function DebugModal({
  data,
  ollamaConnected,
  onClose,
}: {
  data: DebugData | null;
  ollamaConnected: boolean | null;
  onClose: () => void;
}) {
  const ollamaLine =
    ollamaConnected === null ? (
      <span className="text-[0.6875rem] text-muted-foreground">Ollama: checking…</span>
    ) : ollamaConnected ? (
      <span className="text-[0.6875rem] text-muted-foreground">
        <span className="mr-1.5 inline-block size-1.5 rounded-full bg-emerald-500/90 align-middle" aria-hidden />
        Ollama connected
      </span>
    ) : (
      <span className="text-[0.6875rem] text-muted-foreground">
        <span className="mr-1.5 inline-block size-1.5 rounded-full bg-red-500/70 align-middle" aria-hidden />
        Ollama disconnected
      </span>
    );

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
              <div className="mt-1.5">{ollamaLine}</div>
            </div>
            <button type="button" onClick={onClose} className={modalCloseButton} aria-label="Close debug inspector">
              <X size={18} />
            </button>
          </div>

          {data ? (
            <div className="flex max-h-[min(70vh,640px)] flex-col overflow-y-auto px-[18px] pb-5 pt-4 sm:px-3.5 sm:pb-3.5 sm:pt-3.5">
              <section className="flex flex-col gap-2">
                <div className={eyebrowText}>System prompt</div>
                <pre className={debugBlock}>{data.systemPrompt}</pre>
              </section>

              <section className="mt-[18px] flex flex-col gap-2">
                <div className={eyebrowText}>Next call (system + history)</div>
                <p className="mb-1 text-[0.75rem] leading-[1.45] text-muted-foreground">
                  Your next message is added when you send; this is what goes to the model before that.
                </p>
                <pre className={cx(debugBlock, "max-h-[min(50vh,420px)] overflow-auto text-[0.75rem] leading-[1.5]")}>
                  {nextCallPayload(data)}
                </pre>
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
