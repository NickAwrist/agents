import { useCallback, useLayoutEffect, useRef, useEffect } from "react";
import { Bot } from "lucide-react";
import type { Message, MessageStep } from "../types";
import { MessageItem } from "./MessageItem";
import { MarkdownMessage } from "./MarkdownMessage";
import { traceStepsForDisplay } from "./ExecutionTrace";

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

function getLiveStepMeta(step: MessageStep | null, count: number, streamingContent: string) {
  const isResponding = streamingContent.trim().length > 0;

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
      label: "Agent",
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
      label: "Agent",
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
    label: isResponding ? "Responding" : "Thinking",
    detail: agentName && step.agentName !== "general_agent" ? agentName : null,
  };
}

export function ChatArea({
  messages,
  streamingSteps,
  streamingStep,
  streamingContent,
  chatPending,
  footerInset,
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
  streamingContent: string;
  chatPending: boolean;
  footerInset: number;
  onViewSteps: (steps: MessageStep[] | "live") => void;
  editingUserIndex: number | null;
  onStartEditUser: (index: number) => void;
  onCancelEditUser: () => void;
  onRequestEditConfirm: (userIndex: number, text: string) => void;
  onRequestRetryConfirm: (userIndex: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const liveMeta = getLiveStepMeta(streamingStep, streamingSteps.length, streamingContent);
  const isBusy = chatPending || streamingStep !== null || streamingSteps.length > 0;

  const scrollMessagesToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onScroll = () => {
      const gap = container.scrollHeight - container.scrollTop - container.clientHeight;
      wasAtBottomRef.current = gap < 80;
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    scrollMessagesToBottom();
    wasAtBottomRef.current = true;
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
  }, [messages, streamingStep, streamingSteps, streamingContent, scrollMessagesToBottom]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      if (wasAtBottomRef.current) {
        scrollMessagesToBottom();
      }
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [scrollMessagesToBottom]);

  return (
    <div className="relative h-full min-h-0 flex-1 overflow-x-hidden">
      <div
        ref={scrollRef}
        className="absolute inset-0 z-0 overflow-x-hidden overflow-y-auto px-5 pt-[calc(3.5rem+1.25rem)] max-[640px]:px-3.5 max-[640px]:pt-[calc(52px+1rem)]"
        style={{ paddingBottom: footerInset + 12 }}
      >
        <div ref={contentRef} className="mx-auto flex min-h-min w-full max-w-3xl flex-col">
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
                onViewSteps={
                  message.steps && traceStepsForDisplay(message.steps).length > 0
                    ? () => onViewSteps(message.steps!)
                    : undefined
                }
                isBusy={isBusy}
                editingUserIndex={editingUserIndex}
                onStartEditUser={onStartEditUser}
                onCancelEditUser={onCancelEditUser}
                onRequestEditConfirm={onRequestEditConfirm}
                onRequestRetryConfirm={onRequestRetryConfirm}
              />
            ))}

            {(streamingStep || streamingSteps.length > 0) && (
              <div className="ui-animate-slide-up mt-0 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-subtle bg-transparent py-[10px] pb-3 text-[0.8125rem] text-muted-foreground">
                {streamingSteps.length > 0 ? (
                  <button
                    type="button"
                    className="flex min-w-0 max-w-full flex-wrap items-center gap-2.5 rounded-md border border-transparent px-1 py-0.5 text-left text-inherit transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                    onClick={() => onViewSteps("live")}
                    aria-label="View execution trace"
                  >
                    <div className="ui-live-status-dot size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                    <span className="font-medium text-foreground">{liveMeta.label}</span>
                    {liveMeta.detail && (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-transparent px-2 py-[3px] text-[0.6875rem] font-medium text-foreground">
                        {liveMeta.detail}
                      </span>
                    )}
                  </button>
                ) : (
                  <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                    <div className="ui-live-status-dot size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                    <span className="font-medium">{liveMeta.label}</span>
                    {liveMeta.detail && (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-transparent px-2 py-[3px] text-[0.6875rem] font-medium text-foreground">
                        {liveMeta.detail}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {streamingContent && (
              <div className="ui-animate-slide-up flex w-full min-w-0 flex-col">
                <div className="flex w-full justify-start pt-4 max-[640px]:pt-3.5" aria-hidden>
                  <div className="h-px w-9 max-[640px]:w-8 shrink-0 rounded-full bg-border-subtle/70" />
                </div>
                <div className="max-w-[min(100%,42rem)] min-w-0 pt-2">
                  <MarkdownMessage className="text-foreground">{streamingContent}</MarkdownMessage>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
