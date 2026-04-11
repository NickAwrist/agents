import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Bot } from "lucide-react";
import { MessageItem } from "../MessageItem";
import { MarkdownMessage } from "../MarkdownMessage";
import { traceStepsForDisplay } from "../ExecutionTrace";
import { StreamingStatusRow } from "./StreamingStatusRow";
import type { ChatAreaProps } from "./types";

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
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
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
            <StreamingStatusRow
              streamingStep={streamingStep}
              streamingSteps={streamingSteps}
              streamingContent={streamingContent}
              onViewSteps={onViewSteps}
            />
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
