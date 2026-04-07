import { useCallback, useLayoutEffect, useRef } from "react";
import { ArrowUp, Bot } from "lucide-react";
import type { Message, MessageStep } from "../types";
import { MessageItem } from "./MessageItem";
import { cx, primaryButton, secondaryButtonSmall } from "../styles";

function startCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAgentName(name?: string) {
  if (!name) return null;
  if (name === "general_agent") return "Main agent";
  if (name === "coding_agent") return "Coding agent";
  if (name === "computer_agent") return "Computer agent";
  if (name === "code_discovery_agent") return "Code discovery agent";
  return startCase(name);
}

function getLiveStepMeta(step: MessageStep | null, count: number) {
  if (!step) {
    return {
      label: "Running",
      detail: `${count} step${count === 1 ? "" : "s"}`,
    };
  }

  const toolName = step.toolName ? startCase(step.toolName) : null;
  const agentName = formatAgentName(step.agentName);
  const isSubagentTool = step.kind === "tool_call" && step.toolName?.endsWith("_agent");

  if (isSubagentTool) {
    return {
      label: "Subagent",
      detail: toolName,
    };
  }

  if (step.kind === "tool_call") {
    return {
      label: "Tool",
      detail: toolName,
    };
  }

  if (step.kind === "llm_call" && agentName && step.agentName !== "general_agent") {
    return {
      label: "Subagent",
      detail: agentName,
    };
  }

  if (step.kind === "complete") {
    return {
      label: "Writing",
      detail: null,
    };
  }

  if (step.kind === "error") {
    return {
      label: "Error",
      detail: null,
    };
  }

  return {
    label: "Thinking",
    detail: agentName && step.agentName !== "general_agent" ? agentName : null,
  };
}

export function ChatArea({
  messages,
  streamingSteps,
  streamingStep,
  chatPending,
  ollamaReady,
  input,
  setInput,
  onSendMessage,
  onViewSteps,
  editingUserIndex,
  onStartEditUser,
  onCancelEditUser,
  onRequestEditConfirm,
  onRequestRetryConfirm,
}: {
  messages: Message[];
  streamingSteps: MessageStep[];
  streamingStep: MessageStep | null;
  chatPending: boolean;
  ollamaReady: boolean;
  input: string;
  setInput: (v: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onViewSteps: (steps: MessageStep[] | "live") => void;
  editingUserIndex: number | null;
  onStartEditUser: (index: number) => void;
  onCancelEditUser: () => void;
  onRequestEditConfirm: (userIndex: number, text: string) => void;
  onRequestRetryConfirm: (userIndex: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const liveMeta = getLiveStepMeta(streamingStep, streamingSteps.length);
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

  const scrollMessagesToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    scrollMessagesToBottom();
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      scrollMessagesToBottom();
      requestAnimationFrame(() => {
        if (!cancelled) scrollMessagesToBottom();
      });
    });
    return () => {
      cancelled = true;
    };
  }, [messages, streamingStep, streamingSteps, scrollMessagesToBottom]);

  return (
    <div className="h-full min-h-0 flex-1">
      <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]">
        <div
          ref={scrollRef}
          className="h-full min-h-0 overflow-x-hidden overflow-y-auto px-5 pb-3 pt-[calc(3.5rem+1.25rem)] max-[640px]:px-3.5 max-[640px]:pb-3 max-[640px]:pt-[calc(52px+1rem)]"
        >
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
                messageIndex={index}
                message={message}
                animDelayMs={Math.min(index, 10) * 32}
                onViewSteps={message.steps && message.steps.length > 0 ? () => onViewSteps(message.steps!) : undefined}
                isBusy={isBusy}
                editingUserIndex={editingUserIndex}
                onStartEditUser={onStartEditUser}
                onCancelEditUser={onCancelEditUser}
                onRequestEditConfirm={onRequestEditConfirm}
                onRequestRetryConfirm={onRequestRetryConfirm}
              />
            ))}

            {(streamingStep || streamingSteps.length > 0) && (
              <div className="ui-animate-slide-up mt-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border-subtle bg-transparent py-[10px] pb-3 text-[0.8125rem] text-muted-foreground">
                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                  <div className="size-1.5 shrink-0 rounded-full bg-accent animate-pulse" aria-hidden />
                  <span className="font-medium">{liveMeta.label}</span>
                  {liveMeta.detail && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-transparent px-2 py-[3px] text-[0.6875rem] font-medium text-foreground">
                      {liveMeta.detail}
                    </span>
                  )}
                </div>
                {streamingSteps.length > 0 && (
                  <button
                    type="button"
                    className={cx(secondaryButtonSmall, "px-1.5 py-1 text-[0.6875rem] text-muted-foreground/80 hover:text-muted-foreground")}
                    onClick={() => onViewSteps("live")}
                  >
                    Trace
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center border-t border-border-subtle bg-background px-5 pb-4 pt-3 max-[640px]:px-3.5 max-[640px]:pb-3.5 max-[640px]:pt-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSendMessage(e);
            }}
            className="flex w-full max-w-3xl items-center gap-2 rounded-xl border border-border-subtle bg-surface px-[14px] py-[6px] pr-[6px] focus-within:border-border focus-within:shadow-[0_0_0_1px_var(--color-accent-ring)]"
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
            <button
              type="submit"
              disabled={!input.trim() || !canSend}
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
