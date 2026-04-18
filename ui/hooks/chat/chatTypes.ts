import type { Message } from "../../types";

/** Wired from useChatApp so loadSession can restore mid-flight UI when returning to that session. */
export type ChatFlightApi = {
  shouldPreserveMessages: (sessionId: string) => boolean;
  getTurnSnapshot: () => Message[] | null;
  hydrateStreaming: () => void;
  reconnectToStream: (sessionId: string, requestId: string) => void;
};
