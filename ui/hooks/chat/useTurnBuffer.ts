import { useCallback, useRef } from "react";
import type { Message, MessageStep } from "../../types";

export type StreamBuffer = {
  content: string;
  thinking: string;
  step: MessageStep | null;
  steps: MessageStep[];
};

/** Refs for streaming token accumulation and reconnect hydration. */
export function useTurnBuffer() {
  const streamBufferRef = useRef<StreamBuffer>({
    content: "",
    thinking: "",
    step: null,
    steps: [],
  });
  const turnMessagesSnapshotRef = useRef<Message[] | null>(null);
  const turnRootAgentNameRef = useRef("");

  const resetStreamBuffers = useCallback(() => {
    streamBufferRef.current = {
      content: "",
      thinking: "",
      step: null,
      steps: [],
    };
  }, []);

  return {
    streamBufferRef,
    turnMessagesSnapshotRef,
    turnRootAgentNameRef,
    resetStreamBuffers,
  };
}
