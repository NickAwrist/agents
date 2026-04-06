import { Bot, Waypoints } from "lucide-react";
import type { Message } from "../types";
import { MarkdownMessage } from "./MarkdownMessage";
import { cx } from "../styles";

export function MessageItem({
  message,
  onViewSteps,
}: {
  message: Message;
  onViewSteps?: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end border-b border-border-subtle py-[14px] last:border-b-0">
        <div className="max-w-[min(85%,36rem)] min-w-0 rounded-xl border border-border-subtle bg-muted px-[14px] py-2.5 max-[640px]:max-w-[92%]">
          <MarkdownMessage className="text-foreground">{message.content}</MarkdownMessage>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 border-b border-border-subtle py-[14px] last:border-b-0 max-[640px]:gap-2.5">
      <div
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[rgba(34,197,94,0.12)] text-accent max-[640px]:size-[26px]"
        aria-hidden
      >
        <Bot size={14} />
      </div>
      <div className="max-w-[min(100%,42rem)] min-w-0">
        <div className="mb-1.5 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <span>Assistant</span>
        </div>
        <MarkdownMessage className="text-foreground">{message.content}</MarkdownMessage>

        {message.steps && message.steps.length > 0 && onViewSteps && (
          <button
            type="button"
            onClick={onViewSteps}
            className={cx(
              "mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-transparent px-2.5 py-1.5 text-[0.75rem] text-muted-foreground transition-colors duration-150 hover:bg-[rgba(34,197,94,0.08)] hover:text-accent",
            )}
          >
            <Waypoints size={13} />
            View trace
          </button>
        )}
      </div>
    </div>
  );
}
