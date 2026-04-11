import type { Message, MessageStep, TraceModalOpenPayload } from "../../types";

export type ChatAreaProps = {
  messages: Message[];
  streamingSteps: MessageStep[];
  streamingStep: MessageStep | null;
  streamingContent: string;
  chatPending: boolean;
  footerInset: number;
  onViewSteps: (payload: TraceModalOpenPayload) => void;
  editingUserIndex: number | null;
  onStartEditUser: (index: number) => void;
  onCancelEditUser: () => void;
  onRequestEditConfirm: (userIndex: number, text: string) => void;
  onRequestRetryConfirm: (userIndex: number) => void;
};
