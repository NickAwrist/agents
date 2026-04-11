import type { Message } from "../../types";

export type MessageItemProps = {
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
};
