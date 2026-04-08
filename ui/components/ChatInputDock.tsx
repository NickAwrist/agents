import { useCallback, useLayoutEffect, useRef } from "react";
import { ArrowUp, Square } from "lucide-react";
import { cx, iconButton, primaryButton } from "../styles";
import type { MessageStep } from "../types";

export function ChatInputDock({
  input,
  setInput,
  onSendMessage,
  onStopGeneration,
  chatPending,
  streamingStep,
  streamingSteps,
  ollamaReady,
  onFooterHeightChange,
}: {
  input: string;
  setInput: (v: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onStopGeneration: () => void;
  chatPending: boolean;
  streamingStep: MessageStep | null;
  streamingSteps: MessageStep[];
  ollamaReady: boolean;
  onFooterHeightChange: (heightPx: number) => void;
}) {
  const footerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isBusy = chatPending || streamingStep !== null || streamingSteps.length > 0;
  const canSend = ollamaReady && !isBusy;

  const syncInputHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const maxPx = window.innerHeight * 0.3;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`;
  }, []);

  useLayoutEffect(() => {
    syncInputHeight();
  }, [input, syncInputHeight]);

  useLayoutEffect(() => {
    const onResize = () => syncInputHeight();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [syncInputHeight]);

  useLayoutEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.offsetHeight;
      if (h > 0) onFooterHeightChange(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onFooterHeightChange]);

  return (
    <div
      ref={footerRef}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center border-t border-border-subtle/60 bg-background/[0.16] px-5 pb-4 pt-3 shadow-[0_-1px_0_0_rgba(255,255,255,0.03)] backdrop-blur-xl backdrop-saturate-125 max-[640px]:px-3.5 max-[640px]:pb-3.5 max-[640px]:pt-2.5"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSendMessage(e);
        }}
        className="pointer-events-auto flex w-full max-w-3xl items-center gap-2 rounded-xl border border-border-subtle bg-surface px-[14px] py-[6px] pr-[6px] focus-within:border-border focus-within:shadow-[0_0_0_1px_var(--color-accent-ring)]"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSendMessage(e);
            }
          }}
          disabled={isBusy}
          placeholder="Send a message…"
          className="min-h-10 max-h-[30vh] w-full flex-1 resize-none overflow-y-auto bg-transparent py-2.5 text-[0.9375rem] leading-[1.5] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          rows={1}
        />
        {isBusy ? (
          <button
            type="button"
            onClick={onStopGeneration}
            className={cx(
              iconButton,
              "size-9 shrink-0 p-0 hover:border-red-500/20 hover:bg-red-500/[0.06] hover:text-red-300",
            )}
            aria-label="Stop generation"
          >
            <Square size={12} strokeWidth={2.25} className="shrink-0" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || !canSend}
            className={cx(primaryButton, "size-9 shrink-0 justify-center rounded-lg p-0")}
            aria-label="Send message"
          >
            <ArrowUp size={18} />
          </button>
        )}
      </form>
    </div>
  );
}
