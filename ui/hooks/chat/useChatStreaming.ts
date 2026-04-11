import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type {
  DebugData,
  Message,
  MessageStep,
  TraceModalSelection,
  TruncateConfirmState,
} from "../../types";
import { fetchSession, patchSessionApi } from "../../persist/sessions";
import type { UserSettings } from "../../persist/userSettings";
import { readSseBlocks } from "../../lib/readSseBlocks";

type Args = {
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  activeSessionId: string | null;
  activeSessionIdRef: MutableRefObject<string | null>;
  isEphemeralRef: MutableRefObject<boolean>;
  userSettingsRef: MutableRefObject<UserSettings>;
  selectedSessionAgentRef: MutableRefObject<string>;
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
};

export function useChatStreaming(p: Args) {
  const [input, setInput] = useState("");
  const [streamingStep, setStreamingStep] = useState<MessageStep | null>(null);
  const [streamingSteps, setStreamingSteps] = useState<MessageStep[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [chatPending, setChatPending] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);

  p.debugOpenRef.current = p.debugOpen;

  useLayoutEffect(() => {
    p.bindStreamingReset(() => {
      setStreamingStep(null);
      setStreamingSteps([]);
      setStreamingContent("");
      setStreamingThinking("");
    });
  }, [p.bindStreamingReset]);

  const fetchDebugData = useCallback(
    async (id: string) => {
      try {
        const agentName = p.selectedSessionAgentRef.current;
        const agentsRes = await fetch("/api/agents");
        const agentsJson = (await agentsRes.json()) as {
          agents?: Array<{ name: string; system_prompt: string }>;
        };
        const row = agentsJson.agents?.find((a) => a.name === agentName);
        const stored = await fetchSession(id);
        p.setDebugData({
          systemPrompt: row?.system_prompt ?? "",
          history: stored?.history ?? [],
          customTitle: stored?.customTitle ?? null,
          modelMessages: stored?.modelMessages,
        });
      } catch (e) {
        console.error("Failed to load debug data", e);
      }
    },
    [p.selectedSessionAgentRef, p.setDebugData],
  );

  const runChatTurn = useCallback(
    async (
      priorMessages: Message[],
      messageText: string,
      options: { rebuildModelMessages: boolean },
    ) => {
      const sid = p.activeSessionIdRef.current;
      if (!messageText.trim() || !sid) return;
      if (!p.ollamaSendReady) return;

      const msg = messageText.trim();
      const ephemeral = p.isEphemeralRef.current;
      setChatPending(true);
      setStreamingStep(null);
      setStreamingSteps([]);
      setStreamingContent("");
      setStreamingThinking("");

      const nextHistory: Message[] = [...priorMessages, { role: "user" as const, content: msg }];
      p.setMessages(nextHistory);

      const failWithAssistantError = async (errText: string) => {
        const failedHistory: Message[] = [
          ...priorMessages,
          { role: "user", content: msg },
          { role: "assistant", content: `Error: ${errText}` },
        ];
        p.setMessages(failedHistory);
        if (!ephemeral) {
          try {
            await patchSessionApi(sid, {
              history: failedHistory,
              modelMessages: options.rebuildModelMessages ? null : p.modelMessagesRef.current,
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
            chatBody.sessionId = sid;
          }
          res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(chatBody),
            signal: controller.signal,
          });
        } catch (err) {
          if (controller.signal.aborted) return;
          console.error(err);
          await failWithAssistantError(err instanceof Error ? err.message : "Network error");
          return;
        }

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
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
              const cd = typeof data.contentDelta === "string" ? data.contentDelta : "";
              const td = typeof data.thinkingDelta === "string" ? data.thinkingDelta : "";
              const agent = typeof data.agentName === "string" ? data.agentName : "";
              if (cd && agent === p.selectedSessionAgentRef.current) {
                setStreamingContent((prev) => prev + cd);
              }
              if (td) setStreamingThinking((prev) => prev + td);
            } else if (data.type === "step") {
              const step = data.step as MessageStep;
              if (step.status === "running") {
                setStreamingThinking("");
                if (step.kind !== "complete") {
                  setStreamingContent("");
                }
              }
              setStreamingStep(step);
              if (Array.isArray(data.steps)) setStreamingSteps(data.steps as MessageStep[]);
            } else if (data.type === "chat_done") {
              setStreamingStep(null);
              setStreamingSteps([]);
              setStreamingContent("");
              setStreamingThinking("");
              if (ephemeral) {
                const assistantContent = typeof data.result === "string" ? data.result : "";
                const steps = (Array.isArray(data.steps) ? data.steps : []) as MessageStep[];
                p.setMessages([
                  ...priorMessages,
                  { role: "user", content: msg },
                  { role: "assistant", content: assistantContent, steps },
                ]);
                if (Array.isArray(data.modelMessages)) {
                  p.modelMessagesRef.current = data.modelMessages as Array<Record<string, unknown>>;
                }
              } else {
                try {
                  const s = await fetchSession(sid);
                  if (s?.history?.length) p.setMessages(s.history);
                  p.modelMessagesRef.current = s?.modelMessages ?? null;
                } catch (e) {
                  console.error(e);
                  const assistantContent = typeof data.result === "string" ? data.result : "";
                  const steps = (Array.isArray(data.steps) ? data.steps : []) as MessageStep[];
                  p.setMessages([
                    ...priorMessages,
                    { role: "user", content: msg },
                    { role: "assistant", content: assistantContent, steps },
                  ]);
                }
                await p.refreshSessions();
              }
              if (p.debugOpenRef.current) void fetchDebugData(sid);
            } else if (data.type === "chat_aborted") {
              setStreamingStep(null);
              setStreamingSteps([]);
              setStreamingContent("");
              setStreamingThinking("");
              const hist = Array.isArray(data.history) ? (data.history as Message[]) : [];
              if (hist.length) p.setMessages(hist);
              if (!ephemeral) {
                try {
                  const s = await fetchSession(sid);
                  if (s?.history?.length) p.setMessages(s.history);
                  p.modelMessagesRef.current = s?.modelMessages ?? null;
                } catch (e) {
                  console.error(e);
                }
                await p.refreshSessions();
              }
            } else if (data.type === "error") {
              setStreamingStep(null);
              setStreamingSteps([]);
              setStreamingContent("");
              setStreamingThinking("");
              const errText = typeof data.error === "string" ? data.error : "Unknown error";
              await failWithAssistantError(errText);
            }
          });
        } catch (err) {
          if (controller.signal.aborted) return;
          console.error(err);
          await failWithAssistantError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        abortControllerRef.current = null;
        activeRequestIdRef.current = null;
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
      p.setMessages,
      p.userSettingsRef,
    ],
  );

  const stopGeneration = useCallback(() => {
    const requestId = activeRequestIdRef.current;
    const controller = abortControllerRef.current;
    if (!controller) return;

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

    p.setMessages((prev) => {
      const halted: Message[] = [
        ...prev,
        { role: "assistant" as const, content: "*Response halted by user.*" },
      ];
      if (!p.isEphemeralRef.current) {
        const sid = p.activeSessionIdRef.current;
        if (sid) {
          void patchSessionApi(sid, { history: halted }).catch((e) => console.error(e));
        }
      }
      return halted;
    });
  }, [p.activeSessionIdRef, p.isEphemeralRef, p.setMessages]);

  const sendMessage = useCallback(
    async (e?: FormEvent) => {
      if (e) e.preventDefault();
      if (!input.trim() || !p.activeSessionId) return;
      const msg = input.trim();
      if (!p.ollamaSendReady) return;
      setInput("");
      await runChatTurn(p.messages, msg, { rebuildModelMessages: false });
    },
    [input, p.activeSessionId, p.messages, p.ollamaSendReady, runChatTurn],
  );

  const confirmTruncateAndRetry = useCallback(async () => {
    const tc = p.truncateConfirm;
    p.setTruncateConfirm(null);
    p.setEditingUserIndex(null);
    if (!tc || !p.activeSessionId) return;
    const row = p.messages[tc.userIndex];
    if (!row || row.role !== "user") return;
    const text = tc.kind === "edit" ? tc.text : row.content;
    if (!text.trim()) return;
    await runChatTurn(p.messages.slice(0, tc.userIndex), text, { rebuildModelMessages: true });
  }, [p.activeSessionId, p.messages, p.setEditingUserIndex, p.setTruncateConfirm, p.truncateConfirm, runChatTurn]);

  const toggleDebug = useCallback(() => {
    if (!p.debugOpen && p.activeSessionId) {
      void p.fetchOllamaHealth();
      void fetchDebugData(p.activeSessionId);
    }
    p.setDebugOpen((v) => !v);
  }, [fetchDebugData, p.activeSessionId, p.debugOpen, p.fetchOllamaHealth, p.setDebugOpen]);

  const headerChatBusy = chatPending || streamingStep !== null || streamingSteps.length > 0;

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
    chatPending,
    runChatTurn,
    stopGeneration,
    sendMessage,
    confirmTruncateAndRetry,
    toggleDebug,
    fetchDebugData,
    headerChatBusy,
  };
}
