import { useEffect, useRef } from "react";
import { ArrowUp, Bot } from "lucide-react";
import type { Message, MessageStep } from "../types";
import { MessageItem } from "./MessageItem";
import { cx, eyebrowText, primaryButton, secondaryButtonSmall } from "../styles";

export function ChatArea({
  messages,
  streamingSteps,
  streamingStep,
  input,
  setInput,
  onSendMessage,
  onViewSteps,
  sessionPreview,
}: {
  messages: Message[];
  streamingSteps: MessageStep[];
  streamingStep: MessageStep | null;
  input: string;
  setInput: (v: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onViewSteps: (steps: MessageStep[] | "live") => void;
  sessionPreview: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamingStep, streamingSteps]);

  return (
    <div className="h-full min-h-0 flex-1">
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3 max-[640px]:w-full max-[640px]:px-3.5 max-[640px]:pt-2.5">
          <div>
            <div className={eyebrowText}>Topic</div>
            <h2 className="mt-0.5 max-w-[56ch] text-[0.8125rem] font-medium leading-[1.4] text-muted-foreground">
              {sessionPreview || "Message the agent below."}
            </h2>
          </div>
        </div>

        <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto px-5 pb-6 pt-3 max-[640px]:px-3.5 max-[640px]:pb-5 max-[640px]:pt-2.5">
          <div className="mx-auto flex min-h-min w-full max-w-3xl flex-col">
            {messages.length === 0 && (
              <div className="flex items-center gap-2 bg-transparent py-8 text-[0.875rem] text-muted-foreground">
                <Bot size={14} />
                <p>Start the session with a message below.</p>
              </div>
            )}

            {messages.map((message, index) => (
              <MessageItem
                key={index}
                message={message}
                onViewSteps={message.steps && message.steps.length > 0 ? () => onViewSteps(message.steps!) : undefined}
              />
            ))}

            {(streamingStep || streamingSteps.length > 0) && (
              <div className="mt-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border-subtle bg-transparent py-[10px] pb-3 text-[0.8125rem] text-muted-foreground">
                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                  <div className="size-1.5 shrink-0 rounded-full bg-accent animate-pulse" aria-hidden />
                  <span className="font-medium">
                    {streamingStep ? "Thinking…" : `Running · ${streamingSteps.length} step${streamingSteps.length !== 1 ? "s" : ""}`}
                  </span>
                  {streamingStep?.toolName && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-muted px-2 py-[3px] text-[0.6875rem] font-medium text-foreground">
                      {streamingStep.toolName}
                    </span>
                  )}
                </div>
                {streamingSteps.length > 0 && (
                  <button type="button" className={secondaryButtonSmall} onClick={() => onViewSteps("live")}>
                    Steps
                  </button>
                )}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        <div className="flex justify-center border-t border-border-subtle bg-background px-5 pb-4 pt-3 max-[640px]:px-3.5 max-[640px]:pb-3.5 max-[640px]:pt-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSendMessage(e);
            }}
            className="flex w-full max-w-3xl items-end gap-2 rounded-xl border border-border-subtle bg-surface px-[14px] py-[6px] pr-[6px] focus-within:border-border focus-within:shadow-[0_0_0_1px_rgba(34,197,94,0.15)]"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSendMessage(e);
                }
              }}
              placeholder="Send a message…"
              className="min-h-10 max-h-[200px] w-full flex-1 bg-transparent py-2.5 text-[0.9375rem] leading-[1.5] text-foreground outline-none placeholder:text-muted-foreground"
              rows={1}
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className={cx(primaryButton, "size-9 shrink-0 justify-center rounded-lg p-0")}
              aria-label="Send message"
            >
              <ArrowUp size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
