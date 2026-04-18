import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { readSseBlocks } from "../../lib/readSseBlocks";
import { fetchSession } from "../../persist/sessions";
import type { Message, MessageStep } from "../../types";
import type { ChatFlightApi } from "./chatTypes";
import type { StreamBuffer } from "./useTurnBuffer";

type FlightDeps = {
  activeSessionIdRef: MutableRefObject<string | null>;
  modelMessagesRef: MutableRefObject<Array<Record<string, unknown>> | null>;
  selectedSessionAgentRef: MutableRefObject<string>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  refreshSessions: () => Promise<void>;
  streamBufferRef: MutableRefObject<StreamBuffer>;
  setStreamingStep: Dispatch<SetStateAction<MessageStep | null>>;
  setStreamingSteps: Dispatch<SetStateAction<MessageStep[]>>;
  setStreamingContent: Dispatch<SetStateAction<string>>;
  setStreamingThinking: Dispatch<SetStateAction<string>>;
  setChatPending: Dispatch<SetStateAction<boolean>>;
};

export function useChatFlight(
  deps: FlightDeps,
  chatFlightRef: MutableRefObject<ChatFlightApi | null>,
  rawChatPendingRef: MutableRefObject<boolean>,
  inFlightSessionIdRef: MutableRefObject<string | null>,
  inFlightEphemeralRef: MutableRefObject<boolean>,
  turnMessagesSnapshotRef: MutableRefObject<Message[] | null>,
) {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const [inFlightSessionId, setInFlightSessionId] = useState<string | null>(
    null,
  );

  const reconnectToStream = useCallback(
    (sessionId: string, _requestId: string) => {
      if (rawChatPendingRef.current) return;

      const d = depsRef.current;
      const controller = new AbortController();
      abortControllerRef.current = controller;
      activeRequestIdRef.current = _requestId;
      inFlightSessionIdRef.current = sessionId;
      inFlightEphemeralRef.current = false;
      rawChatPendingRef.current = true;
      d.streamBufferRef.current = {
        content: "",
        thinking: "",
        step: null,
        steps: [],
      };

      setInFlightSessionId(sessionId);
      d.setChatPending(true);
      d.setStreamingStep(null);
      d.setStreamingSteps([]);
      d.setStreamingContent("");
      d.setStreamingThinking("");

      const rootAgent = d.selectedSessionAgentRef.current;
      const viewing = () => d.activeSessionIdRef.current === sessionId;

      void (async () => {
        try {
          const res = await fetch(
            `/api/chat/stream/${encodeURIComponent(sessionId)}`,
            {
              signal: controller.signal,
            },
          );
          if (!res.ok || !res.body) return;
          const reader = res.body.getReader();
          const finalizeReconnect = async () => {
            if (viewing()) {
              d.setStreamingStep(null);
              d.setStreamingSteps([]);
              d.setStreamingContent("");
              d.setStreamingThinking("");
            }
            try {
              const s = await fetchSession(sessionId);
              if (viewing()) {
                if (s?.history?.length) d.setMessages(s.history);
                d.modelMessagesRef.current = s?.modelMessages ?? null;
              }
            } catch (e) {
              console.error(e);
            }
            await d.refreshSessions();
          };

          await readSseBlocks(reader, async (data) => {
            if (data.type === "chat_started") {
              if (typeof data.requestId === "string") {
                activeRequestIdRef.current = data.requestId;
              }
            } else if (data.type === "stream_delta") {
              const cd =
                typeof data.contentDelta === "string" ? data.contentDelta : "";
              const td =
                typeof data.thinkingDelta === "string"
                  ? data.thinkingDelta
                  : "";
              const agent =
                typeof data.agentName === "string" ? data.agentName : "";
              const buf = d.streamBufferRef.current;
              if (td) buf.thinking += td;
              if (cd && agent === rootAgent) buf.content += cd;
              if (!viewing()) return;
              if (cd && agent === rootAgent)
                d.setStreamingContent((prev) => prev + cd);
              if (td) d.setStreamingThinking((prev) => prev + td);
            } else if (data.type === "step") {
              const step = data.step as MessageStep;
              const buf = d.streamBufferRef.current;
              if (step.status === "running") {
                buf.thinking = "";
                if (step.kind !== "complete") buf.content = "";
              }
              buf.step = step;
              if (Array.isArray(data.steps))
                buf.steps = data.steps as MessageStep[];
              if (!viewing()) return;
              if (step.status === "running") {
                d.setStreamingThinking("");
                if (step.kind !== "complete") d.setStreamingContent("");
              }
              d.setStreamingStep(step);
              if (Array.isArray(data.steps))
                d.setStreamingSteps(data.steps as MessageStep[]);
            } else if (
              data.type === "chat_done" ||
              data.type === "chat_aborted"
            ) {
              await finalizeReconnect();
            } else if (data.type === "error") {
              if (viewing()) {
                d.setStreamingStep(null);
                d.setStreamingSteps([]);
                d.setStreamingContent("");
                d.setStreamingThinking("");
              }
            }
          });
        } catch (err) {
          if (controller.signal.aborted) return;
          console.error("reconnect stream error", err);
        } finally {
          abortControllerRef.current = null;
          activeRequestIdRef.current = null;
          inFlightSessionIdRef.current = null;
          inFlightEphemeralRef.current = false;
          rawChatPendingRef.current = false;
          depsRef.current.streamBufferRef.current = {
            content: "",
            thinking: "",
            step: null,
            steps: [],
          };
          turnMessagesSnapshotRef.current = null;
          setInFlightSessionId(null);
          depsRef.current.setChatPending(false);
        }
      })();
    },
    [
      rawChatPendingRef,
      inFlightSessionIdRef,
      inFlightEphemeralRef,
      turnMessagesSnapshotRef,
    ],
  );

  useLayoutEffect(() => {
    chatFlightRef.current = {
      shouldPreserveMessages: (sessionId: string) =>
        rawChatPendingRef.current && inFlightSessionIdRef.current === sessionId,
      getTurnSnapshot: () => turnMessagesSnapshotRef.current,
      hydrateStreaming: () => {
        const d = depsRef.current;
        const b = d.streamBufferRef.current;
        d.setStreamingContent(b.content);
        d.setStreamingThinking(b.thinking);
        d.setStreamingStep(b.step);
        d.setStreamingSteps(Array.isArray(b.steps) ? [...b.steps] : []);
      },
      reconnectToStream,
    };
  }, [
    chatFlightRef,
    rawChatPendingRef,
    inFlightSessionIdRef,
    reconnectToStream,
    turnMessagesSnapshotRef,
  ]);

  return {
    abortControllerRef,
    activeRequestIdRef,
    inFlightSessionId,
    setInFlightSessionId,
    reconnectToStream,
  };
}
