import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Copy, Pencil, RotateCcw, Send, Waypoints, X } from "lucide-react";
import type { Message } from "../types";
import { MarkdownMessage } from "./MarkdownMessage";
import { traceStepsForDisplay } from "./ExecutionTrace";
import { cx } from "../styles";

const msgIconBtn =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-transparent text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-muted hover:text-foreground active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40";

const msgIconSize = 12;
const msgIconStroke = 2;

export function MessageItem({
  message,
  messageIndex,
  onViewSteps,
  animDelayMs = 0,
  isBusy,
  editingUserIndex,
  onStartEditUser,
  onCancelEditUser,
  onRequestEditConfirm,
  onRequestRetryConfirm,
}: {
  message: Message;
  messageIndex: number;
  onViewSteps?: () => void;
  animDelayMs?: number;
  isBusy: boolean;
  editingUserIndex: number | null;
  onStartEditUser: (index: number) => void;
  onCancelEditUser: () => void;
  onRequestEditConfirm: (userIndex: number, text: string) => void;
  onRequestRetryConfirm: (userIndex: number) => void;
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(message.content);
  const [copied, setCopied] = useState(false);
  /** Pixels: width of the bubble while showing markdown, captured right before switching to the textarea (common “match width on edit” pattern). */
  const [editBubbleWidthPx, setEditBubbleWidthPx] = useState<number | null>(null);

  const isEditingUser = message.role === "user" && editingUserIndex === messageIndex;

  useEffect(() => {
    if (isEditingUser) setDraft(message.content);
  }, [isEditingUser, message.content]);

  useEffect(() => {
    if (!isEditingUser) setEditBubbleWidthPx(null);
  }, [isEditingUser]);

  const enterStyle: CSSProperties | undefined = animDelayMs > 0 ? { animationDelay: `${animDelayMs}ms` } : undefined;

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const beginEdit = () => {
    const el = bubbleRef.current;
    if (el) {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setEditBubbleWidthPx(Math.round(w));
    }
    onStartEditUser(messageIndex);
  };

  const bubbleEditStyle: CSSProperties | undefined =
    isEditingUser && editBubbleWidthPx != null
      ? { width: editBubbleWidthPx, minWidth: editBubbleWidthPx, boxSizing: "border-box" }
      : undefined;

  if (message.role === "user") {
    return (
      <div
        className="ui-animate-slide-up flex justify-end"
        style={enterStyle}
      >
        <div className="group/msg flex w-full min-w-0 flex-col items-end">
          <div
            ref={bubbleRef}
            className={cx(
              "rounded-xl border border-border-subtle bg-muted px-[14px] py-2.5",
              "max-w-[min(85%,36rem)] min-w-0 max-[640px]:max-w-[92%]",
            )}
            style={bubbleEditStyle}
          >
            {isEditingUser ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(12, Math.max(3, draft.split("\n").length))}
                className="box-border min-h-[4.5rem] w-full max-w-full bg-transparent text-[0.9375rem] leading-[1.5] text-foreground outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    onCancelEditUser();
                  }
                }}
              />
            ) : (
              <MarkdownMessage className="text-foreground">{message.content}</MarkdownMessage>
            )}
          </div>
          {!isEditingUser ? (
            <div
              className={cx(
                "mt-1.5 flex max-w-[min(85%,36rem)] flex-wrap justify-end gap-1 self-end max-[640px]:max-w-[92%]",
                "opacity-0 transition-opacity duration-300 ease-out",
                "group-hover/msg:opacity-100 focus-within:opacity-100",
              )}
            >
              <button
                type="button"
                onClick={() => void copyContent()}
                className={msgIconBtn}
                title={copied ? "Copied" : "Copy"}
                aria-label={copied ? "Copied" : "Copy message"}
              >
                {copied ? (
                  <Check size={msgIconSize} strokeWidth={msgIconStroke} />
                ) : (
                  <Copy size={msgIconSize} strokeWidth={msgIconStroke} />
                )}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onRequestRetryConfirm(messageIndex)}
                className={msgIconBtn}
                title="Retry"
                aria-label="Retry from this message; later messages will be deleted"
              >
                <RotateCcw size={msgIconSize} strokeWidth={msgIconStroke} />
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={beginEdit}
                className={msgIconBtn}
                title="Edit"
                aria-label="Edit message and retry"
              >
                <Pencil size={msgIconSize} strokeWidth={msgIconStroke} />
              </button>
            </div>
          ) : (
            <div className="mt-1.5 flex max-w-[min(85%,36rem)] flex-wrap justify-end gap-1 self-end max-[640px]:max-w-[92%]">
              <button
                type="button"
                disabled={isBusy}
                onClick={onCancelEditUser}
                className={msgIconBtn}
                title="Cancel editing"
                aria-label="Cancel editing"
              >
                <X size={msgIconSize} strokeWidth={msgIconStroke} />
              </button>
              <button
                type="button"
                disabled={isBusy || !draft.trim()}
                onClick={() => onRequestEditConfirm(messageIndex, draft.trim())}
                className={msgIconBtn}
                title="Save and retry"
                aria-label="Save edits and retry; later messages will be deleted"
              >
                <Send size={msgIconSize} strokeWidth={msgIconStroke} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="group/msg ui-animate-slide-up flex w-full min-w-0 flex-col"
      style={enterStyle}
    >
      <div className="flex w-full justify-start pt-4 max-[640px]:pt-3.5" aria-hidden>
        <div className="h-px w-9 max-[640px]:w-8 shrink-0 rounded-full bg-border-subtle/70" />
      </div>
      <div className="max-w-[min(100%,42rem)] min-w-0 pt-2">
        <MarkdownMessage className="text-foreground">{message.content}</MarkdownMessage>

        <div
          className={cx(
            "mt-2 flex flex-wrap items-center gap-1",
            "opacity-0 transition-opacity duration-300 ease-out",
            "group-hover/msg:opacity-100 focus-within:opacity-100",
          )}
        >
          <button
            type="button"
            onClick={() => void copyContent()}
            className={msgIconBtn}
            title={copied ? "Copied" : "Copy"}
            aria-label={copied ? "Copied" : "Copy message"}
          >
            {copied ? (
              <Check size={msgIconSize} strokeWidth={msgIconStroke} />
            ) : (
              <Copy size={msgIconSize} strokeWidth={msgIconStroke} />
            )}
          </button>
          {message.steps && traceStepsForDisplay(message.steps).length > 0 && onViewSteps && (
            <button
              type="button"
              onClick={onViewSteps}
              className={msgIconBtn}
              title="View trace"
              aria-label="View trace"
            >
              <Waypoints size={msgIconSize} strokeWidth={msgIconStroke} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
