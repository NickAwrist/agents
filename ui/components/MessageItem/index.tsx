import { useEffect, useRef, useState, type CSSProperties } from "react";
import { copyTextToClipboard } from "../../lib/copyTextToClipboard";
import { AssistantMessageBubble } from "./AssistantMessageBubble";
import { UserMessageBubble } from "./UserMessageBubble";
import type { MessageItemProps } from "./types";

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
}: MessageItemProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [editBubbleWidthPx, setEditBubbleWidthPx] = useState<number | null>(null);

  const isEditingUser = message.role === "user" && editingUserIndex === messageIndex;

  useEffect(() => {
    if (isEditingUser) setDraft(message.content);
  }, [isEditingUser, message.content]);

  useEffect(() => {
    if (!isEditingUser) setEditBubbleWidthPx(null);
  }, [isEditingUser]);

  const enterStyle: CSSProperties | undefined =
    animDelayMs > 0 ? { animationDelay: `${animDelayMs}ms` } : undefined;

  const copyContent = async () => {
    const ok = await copyTextToClipboard(message.content);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
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
      <UserMessageBubble
        message={message}
        messageIndex={messageIndex}
        enterStyle={enterStyle}
        bubbleRef={bubbleRef}
        bubbleEditStyle={bubbleEditStyle}
        isEditingUser={isEditingUser}
        draft={draft}
        setDraft={setDraft}
        copied={copied}
        isBusy={isBusy}
        onCancelEditUser={onCancelEditUser}
        onRequestRetryConfirm={onRequestRetryConfirm}
        onRequestEditConfirm={onRequestEditConfirm}
        beginEdit={beginEdit}
        copyContent={copyContent}
      />
    );
  }

  return (
    <AssistantMessageBubble
      message={message}
      enterStyle={enterStyle}
      copied={copied}
      copyContent={copyContent}
      onViewSteps={onViewSteps}
    />
  );
}
