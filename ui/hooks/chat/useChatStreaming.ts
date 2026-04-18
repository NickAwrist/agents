import {
  type Dispatch,
  type FormEvent,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  DebugData,
  Message,
  MessageStep,
  TraceModalSelection,
  TruncateConfirmState,
} from "../../types";
import type { ChatFlightApi } from "./chatTypes";
export type { ChatFlightApi };
import { readSseBlocks } from "../../lib/readSseBlocks";
import { fetchSession, patchSessionApi } from "../../persist/sessions";
import type { UserSettings } from "../../persist/userSettings";
import { useChatFlight } from "./useChatFlight";
import { useTurnBuffer } from "./useTurnBuffer";

type Args = {
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  activeSessionId: string | null;
  activeSessionIdRef: MutableRefObject<string | null>;
  isEphemeralRef: MutableRefObject<boolean>;
  userSettingsRef: MutableRefObject<UserSettings>;
  selectedSessionAgentRef: MutableRefObject<string>;
  sessionDirectoryRef: MutableRefObject<string>;
  modelMessagesRef: MutableRefObject<Array<Record<string, unknown>> | null>;
  debugOpenRef: MutableRefObject<boolean>;
  debugOpen: boolean;
  setDebugOpen: Dispatch<SetStateAction<boolean>>;
  debugData: DebugData | null;
  setDebugData: Dispatch<SetStateAction<DebugData | null>>;
  stepsModalData: TraceModalSelection;
  setStepsModalData: Dispatch<SetStateAction<TraceModalSelection>>;
  selectedModel: string;
  ollamaSendReady: boolean;
  refreshSessions: () => Promise<void>;
  fetchOllamaHealth: () => Promise<void>;
  bindStreamingReset: (fn: () => void) => void;
  editingUserIndex: number | null;
  setEditingUserIndex: Dispatch<SetStateAction<number | null>>;
  truncateConfirm: TruncateConfirmState;
  setTruncateConfirm: Dispatch<SetStateAction<TruncateConfirmState>>;
  chatFlightRef: MutableRefObject<ChatFlightApi | null>;
};

export function useChatStreaming(p: Args) {
  const [input, setInput] = useState("");
  const [streamingStep, setStreamingStep] = useState<MessageStep | null>(null);
  const [streamingSteps, setStreamingSteps] = useState<MessageStep[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [chatPending, setChatPending] = useState(false);

  const rawChatPendingRef = useRef(false);
  const inFlightSessionIdRef = useRef<string | null>(null);
  const inFlightEphemeralRef = useRef(false);

  const {
    streamBufferRef,
    turnMessagesSnapshotRef,
    turnRootAgentNameRef,
    resetStreamBuffers,
  } = useTurnBuffer();

  p.debugOpenRef.current = p.debugOpen;

  useLayoutEffect(() => {
    p.bindStreamingReset(() => {
      setStreamingStep(null);
      setStreamingSteps([]);
      setStreamingContent("");
      setStreamingThinking("");
      resetStreamBuffers();
    });
  }, [p.bindStreamingReset, resetStreamBuffers]);

  const flight = useChatFlight(
    {
      activeSessionIdRef: p.activeSessionIdRef,
      modelMessagesRef: p.modelMessagesRef,
      selectedSessionAgentRef: p.selectedSessionAgentRef,
      setMessages: p.setMessages,
      refreshSessions: p.refreshSessions,
      streamBufferRef,
      setStreamingStep,
      setStreamingSteps,
      setStreamingContent,
      setStreamingThinking,
      setChatPending,
    },
    p.chatFlightRef,
    rawChatPendingRef,
    inFlightSessionIdRef,
    inFlightEphemeralRef,
    turnMessagesSnapshotRef,
  );

  const {
    abortControllerRef,
    activeRequestIdRef,
    inFlightSessionId,
    setInFlightSessionId,
  } = flight;

  const fetchDebugData = useCallback(
    async (id: string) => {
      try {
        const u = p.userSettingsRef.current;
        const debugRes = await fetch("/api/chat/debug-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(p.isEphemeralRef.current
              ? {
                  ephemeral: true,
                  agentName: p.selectedSessionAgentRef.current,
                }
              : { sessionId: id }),
            sessionDirectory: p.sessionDirectoryRef.current.trim() || undefined,
            personalization: {
              name: u.name,
              location: u.location,
              preferredFormats: u.preferredFormats,
            },
          }),
        });
        if (!debugRes.ok) {
          console.error(
            "debug-prompt failed",
            await debugRes.text().catch(() => ""),
          );
          return;
        }
        const debugJson = (await debugRes.json()) as { systemPrompt?: string };
        const stored = await fetchSession(id);
        p.setDebugData({
          systemPrompt:
            typeof debugJson.systemPrompt === "string"
              ? debugJson.systemPrompt
              : "",
          history: stored?.history ?? [],
          customTitle: stored?.customTitle ?? null,
          modelMessages: stored?.modelMessages,
        });
      } catch (e) {
        console.error("Failed to load debug data", e);
      }
    },
    [
      p.isEphemeralRef,
      p.selectedSessionAgentRef,
      p.sessionDirectoryRef,
      p.setDebugData,
      p.userSettingsRef,
    ],
  );

  const runChatTurn = useCallback(
    async (
      turnSessionId: string,
      priorMessages: Message[],
      messageText: string,
      options: { rebuildModelMessages: boolean },
    ) => {
      if (!messageText.trim() || !turnSessionId) return;
      if (!p.ollamaSendReady) return;

      const msg = messageText.trim();
      const ephemeral = p.isEphemeralRef.current;
      inFlightSessionIdRef.current = turnSessionId;
      inFlightEphemeralRef.current = ephemeral;
      turnRootAgentNameRef.current = p.selectedSessionAgentRef.current;
      streamBufferRef.current = {
        content: "",
        thinking: "",
        step: null,
        steps: [],
      };
      turnMessagesSnapshotRef.current = [
        ...priorMessages,
        { role: "user" as const, content: msg },
      ];
      rawChatPendingRef.current = true;
      setInFlightSessionId(turnSessionId);
      setChatPending(true);
      setStreamingStep(null);
      setStreamingSteps([]);
      setStreamingContent("");
      setStreamingThinking("");

      const viewingThisTurn = () =>
        p.activeSessionIdRef.current === turnSessionId;

      const nextHistory: Message[] = [
        ...priorMessages,
        { role: "user" as const, content: msg },
      ];
      if (viewingThisTurn()) {
        p.setMessages(nextHistory);
      }

      const failWithAssistantError = async (errText: string) => {
        const failedHistory: Message[] = [
          ...priorMessages,
          { role: "user", content: msg },
          { role: "assistant", content: `Error: ${errText}` },
        ];
        if (viewingThisTurn()) {
          p.setMessages(failedHistory);
        }
        if (!ephemeral) {
          let mm = options.rebuildModelMessages
            ? null
            : p.modelMessagesRef.current;
          if (!viewingThisTurn()) {
            try {
              const cur = await fetchSession(turnSessionId);
              mm = options.rebuildModelMessages
                ? null
                : (cur?.modelMessages ?? null);
            } catch {
              mm = options.rebuildModelMessages ? null : null;
            }
          }
          try {
            await patchSessionApi(turnSessionId, {
              history: failedHistory,
              modelMessages: mm,
            });
          } catch (e) {
            console.error(e);
          }
          await p.refreshSessions();
        }
      };

      const modelMessagesPayload = options.rebuildModelMessages
        ? null
        : p.modelMessagesRef.current;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        let res: Response;
        try {
          const u = p.userSettingsRef.current;
          const chatBody: Record<string, unknown> = {
            message: msg,
            history: priorMessages,
            model: p.selectedModel,
            modelMessages: modelMessagesPayload,
            personalization: {
              name: u.name,
              location: u.location,
              preferredFormats: u.preferredFormats,
            },
          };
          if (ephemeral) {
            chatBody.ephemeral = true;
            chatBody.agentName = p.selectedSessionAgentRef.current;
          } else {
            chatBody.sessionId = turnSessionId;
          }
          chatBody.sessionDirectory =
            p.sessionDirectoryRef.current.trim() || undefined;
          res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(chatBody),
            signal: controller.signal,
          });
        } catch (err) {
          if (controller.signal.aborted) return;
          console.error(err);
          await failWithAssistantError(
            err instanceof Error ? err.message : "Network error",
          );
          return;
        }

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          await failWithAssistantError(
            typeof errBody.error === "string" ? errBody.error : res.statusText,
          );
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          await failWithAssistantError("No response body");
          return;
        }

        try {
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
              const buf = streamBufferRef.current;
              if (td) buf.thinking += td;
              if (cd && agent === turnRootAgentNameRef.current) {
                buf.content += cd;
              }
              if (!viewingThisTurn()) return;
              if (cd && agent === turnRootAgentNameRef.current) {
                setStreamingContent((prev) => prev + cd);
              }
              if (td) setStreamingThinking((prev) => prev + td);
            } else if (data.type === "step") {
              const step = data.step as MessageStep;
              const buf = streamBufferRef.current;
              if (step.status === "running") {
                buf.thinking = "";
                if (step.kind !== "complete") {
                  buf.content = "";
                }
              }
              buf.step = step;
              if (Array.isArray(data.steps))
                buf.steps = data.steps as MessageStep[];
              if (!viewingThisTurn()) return;
              if (step.status === "running") {
                setStreamingThinking("");
                if (step.kind !== "complete") {
                  setStreamingContent("");
                }
              }
              setStreamingStep(step);
              if (Array.isArray(data.steps))
                setStreamingSteps(data.steps as MessageStep[]);
            } else if (data.type === "chat_done") {
              if (viewingThisTurn()) {
                setStreamingStep(null);
                setStreamingSteps([]);
                setStreamingContent("");
                setStreamingThinking("");
              }
              if (ephemeral) {
                const assistantContent =
                  typeof data.result === "string" ? data.result : "";
                const steps = (
                  Array.isArray(data.steps) ? data.steps : []
                ) as MessageStep[];
                if (viewingThisTurn()) {
                  p.setMessages([
                    ...priorMessages,
                    { role: "user", content: msg },
                    { role: "assistant", content: assistantContent, steps },
                  ]);
                  if (Array.isArray(data.modelMessages)) {
                    p.modelMessagesRef.current = data.modelMessages as Array<
                      Record<string, unknown>
                    >;
                  }
                }
              } else {
                try {
                  const s = await fetchSession(turnSessionId);
                  if (viewingThisTurn()) {
                    if (s?.history?.length) p.setMessages(s.history);
                    p.modelMessagesRef.current = s?.modelMessages ?? null;
                  }
                } catch (e) {
                  console.error(e);
                  const assistantContent =
                    typeof data.result === "string" ? data.result : "";
                  const steps = (
                    Array.isArray(data.steps) ? data.steps : []
                  ) as MessageStep[];
                  if (viewingThisTurn()) {
                    p.setMessages([
                      ...priorMessages,
                      { role: "user", content: msg },
                      { role: "assistant", content: assistantContent, steps },
                    ]);
                  }
                }
                await p.refreshSessions();
              }
              if (p.debugOpenRef.current && viewingThisTurn())
                void fetchDebugData(turnSessionId);
            } else if (data.type === "chat_aborted") {
              if (viewingThisTurn()) {
                setStreamingStep(null);
                setStreamingSteps([]);
                setStreamingContent("");
                setStreamingThinking("");
              }
              const hist = Array.isArray(data.history)
                ? (data.history as Message[])
                : [];
              if (hist.length && viewingThisTurn()) p.setMessages(hist);
              if (!ephemeral) {
                try {
                  const s = await fetchSession(turnSessionId);
                  if (viewingThisTurn()) {
                    if (s?.history?.length) p.setMessages(s.history);
                    p.modelMessagesRef.current = s?.modelMessages ?? null;
                  }
                } catch (e) {
                  console.error(e);
                }
                await p.refreshSessions();
              }
            } else if (data.type === "error") {
              if (viewingThisTurn()) {
                setStreamingStep(null);
                setStreamingSteps([]);
                setStreamingContent("");
                setStreamingThinking("");
              }
              const errText =
                typeof data.error === "string" ? data.error : "Unknown error";
              await failWithAssistantError(errText);
            }
          });
        } catch (err) {
          if (controller.signal.aborted) return;
          console.error(err);
          await failWithAssistantError(
            err instanceof Error ? err.message : String(err),
          );
        }
      } finally {
        abortControllerRef.current = null;
        activeRequestIdRef.current = null;
        inFlightSessionIdRef.current = null;
        inFlightEphemeralRef.current = false;
        rawChatPendingRef.current = false;
        streamBufferRef.current = {
          content: "",
          thinking: "",
          step: null,
          steps: [],
        };
        turnMessagesSnapshotRef.current = null;
        setInFlightSessionId(null);
        setChatPending(false);
      }
    },
    [
      fetchDebugData,
      p.activeSessionIdRef,
      p.debugOpenRef,
      p.isEphemeralRef,
      p.modelMessagesRef,
      p.ollamaSendReady,
      p.refreshSessions,
      p.selectedModel,
      p.selectedSessionAgentRef,
      p.sessionDirectoryRef,
      p.setMessages,
      p.userSettingsRef,
    ],
  );

  const stopGeneration = useCallback(() => {
    const requestId = activeRequestIdRef.current;
    const controller = abortControllerRef.current;
    if (!controller) return;

    const turnSid = inFlightSessionIdRef.current;
    const turnEphemeral = inFlightEphemeralRef.current;

    if (requestId) {
      fetch("/api/chat/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      }).catch(() => {});
    }

    controller.abort();
    abortControllerRef.current = null;
    activeRequestIdRef.current = null;

    setStreamingStep(null);
    setStreamingSteps([]);
    setStreamingContent("");
    setStreamingThinking("");
    setChatPending(false);
    setInFlightSessionId(null);
    inFlightSessionIdRef.current = null;
    inFlightEphemeralRef.current = false;
    rawChatPendingRef.current = false;
    streamBufferRef.current = {
      content: "",
      thinking: "",
      step: null,
      steps: [],
    };
    turnMessagesSnapshotRef.current = null;

    p.setMessages((prev) => {
      if (!turnSid || p.activeSessionIdRef.current !== turnSid) return prev;
      const halted: Message[] = [
        ...prev,
        { role: "assistant" as const, content: "*Response halted by user.*" },
      ];
      if (!turnEphemeral) {
        void patchSessionApi(turnSid, { history: halted }).catch((e) =>
          console.error(e),
        );
      }
      return halted;
    });
  }, [p.activeSessionIdRef, p.setMessages]);

  const sendMessage = useCallback(
    async (e?: FormEvent) => {
      if (e) e.preventDefault();
      const sid = p.activeSessionId;
      if (!input.trim() || !sid) return;
      const msg = input.trim();
      if (!p.ollamaSendReady) return;
      setInput("");
      await runChatTurn(sid, p.messages, msg, { rebuildModelMessages: false });
    },
    [input, p.activeSessionId, p.messages, p.ollamaSendReady, runChatTurn],
  );

  const confirmTruncateAndRetry = useCallback(async () => {
    const tc = p.truncateConfirm;
    p.setTruncateConfirm(null);
    p.setEditingUserIndex(null);
    const sid = p.activeSessionId;
    if (!tc || !sid) return;
    const row = p.messages[tc.userIndex];
    if (!row || row.role !== "user") return;
    const text = tc.kind === "edit" ? tc.text : row.content;
    if (!text.trim()) return;
    await runChatTurn(sid, p.messages.slice(0, tc.userIndex), text, {
      rebuildModelMessages: true,
    });
  }, [
    p.activeSessionId,
    p.messages,
    p.setEditingUserIndex,
    p.setTruncateConfirm,
    p.truncateConfirm,
    runChatTurn,
  ]);

  const toggleDebug = useCallback(() => {
    if (!p.debugOpen && p.activeSessionId) {
      void p.fetchOllamaHealth();
      void fetchDebugData(p.activeSessionId);
    }
    p.setDebugOpen((v) => !v);
  }, [
    fetchDebugData,
    p.activeSessionId,
    p.debugOpen,
    p.fetchOllamaHealth,
    p.setDebugOpen,
  ]);

  const sessionChatBusy =
    (chatPending || streamingStep !== null || streamingSteps.length > 0) &&
    inFlightSessionId != null &&
    inFlightSessionId === p.activeSessionId;

  return {
    input,
    setInput,
    streamingStep,
    streamingSteps,
    streamingContent,
    streamingThinking,
    setDebugOpen: p.setDebugOpen,
    setDebugData: p.setDebugData,
    setStepsModalData: p.setStepsModalData,
    stepsModalData: p.stepsModalData,
    debugOpen: p.debugOpen,
    debugData: p.debugData,
    editingUserIndex: p.editingUserIndex,
    setEditingUserIndex: p.setEditingUserIndex,
    truncateConfirm: p.truncateConfirm,
    setTruncateConfirm: p.setTruncateConfirm,
    chatPending: sessionChatBusy,
    runChatTurn,
    stopGeneration,
    sendMessage,
    confirmTruncateAndRetry,
    toggleDebug,
    fetchDebugData,
    headerChatBusy: sessionChatBusy,
  };
}
