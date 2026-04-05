import { Bot, User, Waypoints } from "lucide-react";
import type { Message } from "../types";

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
        <div className="message-bubble message-bubble--user">
          <div className="message-bubble__content">{message.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="message-row message-row--assistant">
      <div className="message-avatar">
        <Bot size={16} />
      </div>
      <div className="message-bubble message-bubble--assistant">
        <div className="message-bubble__meta">
          <span>Agent</span>
        </div>
        <div className="message-bubble__content message-bubble__content--assistant">{message.content}</div>

        {message.steps && message.steps.length > 0 && onViewSteps && (
          <button onClick={onViewSteps} className="trace-button">
            <Waypoints size={14} />
            View internal trace
          </button>
        )}
      </div>
    </div>
  );
}
