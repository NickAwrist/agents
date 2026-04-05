import { Bot, Waypoints } from "lucide-react";
import type { Message } from "../types";
import { MarkdownMessage } from "./MarkdownMessage";

export function MessageItem({
  message,
  onViewSteps,
}: {
  message: Message;
  onViewSteps?: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className="message-row message-row--user">
        <div className="message-block message-block--user">
          <MarkdownMessage className="message-markdown--user">{message.content}</MarkdownMessage>
        </div>
      </div>
    );
  }

  return (
    <div className="message-row message-row--assistant">
      <div className="message-avatar" aria-hidden>
        <Bot size={14} />
      </div>
      <div className="message-block message-block--assistant">
        <div className="message-block__meta">
          <span>Assistant</span>
        </div>
        <MarkdownMessage className="message-markdown--assistant">{message.content}</MarkdownMessage>

        {message.steps && message.steps.length > 0 && onViewSteps && (
          <button type="button" onClick={onViewSteps} className="trace-button">
            <Waypoints size={13} />
            View trace
          </button>
        )}
      </div>
    </div>
  );
}
