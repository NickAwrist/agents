import { useEffect, useRef } from "react";
import { ArrowUp, Bot } from "lucide-react";
import type { Message, MessageStep } from "../types";
import { MessageItem } from "./MessageItem";

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
    <div className="chat-workspace">
      <div className="chat-main-panel">
        <div className="chat-main-panel__intro">
          <div>
            <div className="chat-main-panel__eyebrow">Conversation</div>
            <h2>{sessionPreview || "Ask directly. Inspect everything."}</h2>
          </div>
        </div>

        <div className="chat-scroll-region">
          <div className="chat-thread">
            {messages.length === 0 && (
              <div className="chat-thread__empty chat-thread__empty--subtle">
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

            {streamingSteps.length > 0 && (
              <div className="live-run-card">
                <div className="live-run-card__header">
                  <div className="live-run-card__title">Run in progress</div>
                  <button className="secondary-button secondary-button--small" onClick={() => onViewSteps("live")}>
                    View steps
                  </button>
                </div>
                <div className="live-run-card__body">
                  <span>{streamingSteps.length} internal step{streamingSteps.length !== 1 ? "s" : ""} captured so far</span>
                  {streamingStep?.toolName && <span className="tool-pill">{streamingStep.toolName}</span>}
                </div>
              </div>
            )}

            {streamingStep && (
              <div className="working-row">
                <div className="working-row__spinner" />
                <div className="working-row__copy">
                  <span>Agent is working through the current run.</span>
                  {streamingStep.toolName && <span className="tool-pill">{streamingStep.toolName}</span>}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        <div className="composer-shell">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSendMessage(e);
            }}
            className="composer-card"
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
              placeholder="Message agent..."
              className="composer-input"
              rows={1}
            />
            <button type="submit" disabled={!input.trim()} className="composer-submit" aria-label="Send message">
              <ArrowUp size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
