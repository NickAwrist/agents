import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { SessionSummary, Message, MessageStep, DebugData, OllamaModelOption } from "../types";
import { loadChatsV1, removeStoredSession, upsertStoredSession } from "../persist/chats";
import { loadPreferredModel, savePreferredModel } from "../persist/modelPreference";
import { storedSessionToSummary } from "../persist/preview";
import { readSseBlocks } from "../lib/readSseBlocks";
import { isStoredSessionEmpty, randomSessionId } from "../lib/sessionUtils";

const OLLAMA_HEALTH_POLL_MS = 3000;

export function useChatApp() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streamingStep, setStreamingStep] = useState<MessageStep | null>(null);
  const [streamingSteps, setStreamingSteps] = useState<MessageStep[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<DebugData | null>(null);
  const [stepsModalData, setStepsModalData] = useState<MessageStep[] | "live" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [editingUserIndex, setEditingUserIndex] = useState<number | null>(null);
  const [truncateConfirm, setTruncateConfirm] = useState<
    { kind: "edit"; userIndex: number; text: string } | { kind: "retry"; userIndex: number } | null
  >(null);
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(null);
  const [chatPending, setChatPending] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelOption[]>([]);
  const [modelsLoadError, setModelsLoadError] = useState<string | null>(null);
  const [serverDefaultModel, setServerDefaultModel] = useState("gemma4:31b");
  const [selectedModel, setSelectedModel] = useState(() => loadPreferredModel("gemma4:31b"));
  const [ollamaConnected, setOllamaConnected] = useState<boolean | null>(null);
  const debugOpenRef = useRef(false);
  debugOpenRef.current = debugOpen;

  const fetchOllamaHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/ollama/health");
      const data = (await res.json().catch(() => ({}))) as { connected?: boolean };
      if (!res.ok) {
        setOllamaConnected(false);
        return;
      }
      setOllamaConnected(data.connected === true);
    } catch {
      setOllamaConnected(false);
    }
  }, []);

  useEffect(() => {
    void fetchOllamaHealth();
    const id = window.setInterval(() => void fetchOllamaHealth(), OLLAMA_HEALTH_POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchOllamaHealth]);

  const ollamaReady = ollamaConnected === true;
  const ollamaDisconnected = ollamaConnected === false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/models");
        const data = (await res.json()) as {
          models?: unknown;
          defaultModel?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setModelsLoadError(typeof data.error === "string" ? data.error : res.statusText);
          setOllamaModels([]);
          return;
        }
        setModelsLoadError(null);
        const raw = Array.isArray(data.models) ? data.models : [];
        const list: OllamaModelOption[] = raw
          .filter((m): m is Record<string, unknown> => m != null && typeof m === "object")
          .map((m) => m.name)
          .filter((n): n is string => typeof n === "string" && n.length > 0)
          .map((name) => ({ name }));
        setOllamaModels(list);
        if (typeof data.defaultModel === "string" && data.defaultModel.trim()) {
          setServerDefaultModel(data.defaultModel.trim());
        }
      } catch (e) {
        if (!cancelled) {
          setModelsLoadError(e instanceof Error ? e.message : String(e));
          setOllamaModels([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    const stored = loadChatsV1().find((s) => s.id === activeSessionId);
    const preference = stored?.model?.trim() || loadPreferredModel(serverDefaultModel);
    const names = new Set(ollamaModels.map((m) => m.name));
    let next = preference;
    if (names.size > 0 && !names.has(next)) {
      next = names.has(serverDefaultModel) ? serverDefaultModel : (ollamaModels[0]?.name ?? next);
    }
    setSelectedModel(next);
  }, [activeSessionId, ollamaModels, serverDefaultModel]);

  const handleModelChange = useCallback(
    (model: string) => {
      setSelectedModel(model);
      savePreferredModel(model);
      if (activeSessionId) {
        upsertStoredSession({ id: activeSessionId, model, updatedAt: Date.now() });
      }
    },
    [activeSessionId],
  );

  const refreshSessions = useCallback(() => {
    const list = loadChatsV1()
      .map(storedSessionToSummary)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    setSessions(list);
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const loadSession = useCallback((id: string) => {
    setActiveSessionId(id);
    setMessages([]);
    setStreamingStep(null);
    setStreamingSteps([]);
    setEditingUserIndex(null);
    setTruncateConfirm(null);
    const stored = loadChatsV1().find((s) => s.id === id);
    if (stored?.history?.length) {
      setMessages(stored.history);
    }
  }, []);

  const switchToSession = useCallback(
    (id: string) => {
      if (activeSessionId && activeSessionId !== id && isStoredSessionEmpty(activeSessionId)) {
        removeStoredSession(activeSessionId);
        refreshSessions();
      }
      loadSession(id);
    },
    [activeSessionId, loadSession, refreshSessions],
  );

  const createSession = useCallback(() => {
    setIsLoading(true);
    try {
      if (activeSessionId && isStoredSessionEmpty(activeSessionId)) {
        removeStoredSession(activeSessionId);
      }
      const id = randomSessionId();
      upsertStoredSession({
        id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        history: [],
        customTitle: null,
      });
      refreshSessions();
      loadSession(id);
      setSidebarOpen(false);
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  }, [activeSessionId, loadSession, refreshSessions]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const fetchDebugData = useCallback(async (id: string) => {
    try {
      const spRes = await fetch("/api/agent/system-prompt");
      const spJson = (await spRes.json()) as { systemPrompt?: string };
      const stored = loadChatsV1().find((s) => s.id === id);
      setDebugData({
        systemPrompt: spJson.systemPrompt ?? "",
        history: stored?.history ?? [],
        customTitle: stored?.customTitle ?? null,
        modelMessages: stored?.modelMessages,
      });
    } catch (e) {
      console.error("Failed to load debug data", e);
    }
  }, []);

  const runChatTurn = useCallback(
    async (
      priorMessages: Message[],
      messageText: string,
      options: { rebuildModelMessages: boolean },
    ) => {
      if (!messageText.trim() || !activeSessionId) return;
      if (!ollamaReady) return;

      const msg = messageText.trim();
      setChatPending(true);
      setStreamingStep(null);
      setStreamingSteps([]);

      const nextHistory: Message[] = [...priorMessages, { role: "user" as const, content: msg }];
      setMessages(nextHistory);
      upsertStoredSession({
        id: activeSessionId,
        history: nextHistory,
        updatedAt: Date.now(),
        ...(options.rebuildModelMessages ? { modelMessages: null } : {}),
      });

      const failWithAssistantError = (errText: string) => {
        const failedHistory: Message[] = [
          ...priorMessages,
          { role: "user", content: msg },
          { role: "assistant", content: `Error: ${errText}` },
        ];
        setMessages(failedHistory);
        upsertStoredSession({ id: activeSessionId!, history: failedHistory, updatedAt: Date.now() });
        refreshSessions();
      };

      const snap = loadChatsV1().find((s) => s.id === activeSessionId);
      const modelMessagesPayload = options.rebuildModelMessages ? null : (snap?.modelMessages ?? null);

      try {
        let res: Response;
        try {
          res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: msg,
              history: priorMessages,
              model: selectedModel,
              modelMessages: modelMessagesPayload,
            }),
          });
        } catch (err) {
          console.error(err);
          failWithAssistantError(err instanceof Error ? err.message : "Network error");
          return;
        }

        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          failWithAssistantError(typeof errBody.error === "string" ? errBody.error : res.statusText);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          failWithAssistantError("No response body");
          return;
        }

        try {
          await readSseBlocks(reader, (data) => {
            if (data.type === "step") {
              setStreamingStep(data.step as MessageStep);
              if (Array.isArray(data.steps)) setStreamingSteps(data.steps as MessageStep[]);
            } else if (data.type === "chat_done") {
              setStreamingStep(null);
              setStreamingSteps([]);
              const hist = Array.isArray(data.history) ? (data.history as Message[]) : [];
              setMessages(hist);
              upsertStoredSession({
                id: activeSessionId!,
                history: hist,
                modelMessages: data.modelMessages as Array<Record<string, unknown>> | undefined,
                updatedAt: Date.now(),
              });
              refreshSessions();
              if (debugOpenRef.current) void fetchDebugData(activeSessionId!);
            } else if (data.type === "error") {
              setStreamingStep(null);
              setStreamingSteps([]);
              const errText = typeof data.error === "string" ? data.error : "Unknown error";
              failWithAssistantError(errText);
            }
          });
        } catch (err) {
          console.error(err);
          failWithAssistantError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setChatPending(false);
      }
    },
    [activeSessionId, fetchDebugData, ollamaReady, refreshSessions, selectedModel],
  );

  const sendMessage = useCallback(
    async (e?: FormEvent) => {
      if (e) e.preventDefault();
      if (!input.trim() || !activeSessionId) return;
      const msg = input.trim();
      if (!ollamaReady) return;
      setInput("");
      await runChatTurn(messages, msg, { rebuildModelMessages: false });
    },
    [activeSessionId, input, messages, ollamaReady, runChatTurn],
  );

  const confirmTruncateAndRetry = useCallback(async () => {
    const p = truncateConfirm;
    setTruncateConfirm(null);
    setEditingUserIndex(null);
    if (!p || !activeSessionId) return;
    const row = messages[p.userIndex];
    if (!row || row.role !== "user") return;
    const text = p.kind === "edit" ? p.text : row.content;
    if (!text.trim()) return;
    await runChatTurn(messages.slice(0, p.userIndex), text, { rebuildModelMessages: true });
  }, [activeSessionId, messages, runChatTurn, truncateConfirm]);

  const toggleDebug = useCallback(() => {
    if (!debugOpen && activeSessionId) {
      void fetchOllamaHealth();
      void fetchDebugData(activeSessionId);
    }
    setDebugOpen((v) => !v);
  }, [activeSessionId, debugOpen, fetchDebugData, fetchOllamaHealth]);

  const dropSessionFromApp = useCallback(
    (id: string) => {
      removeStoredSession(id);
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
        setDebugOpen(false);
        setDebugData(null);
        setEditingUserIndex(null);
        setTruncateConfirm(null);
      }
      refreshSessions();
    },
    [activeSessionId, refreshSessions],
  );

  const requestDeleteSession = useCallback(
    (id: string) => {
      if (isStoredSessionEmpty(id)) {
        dropSessionFromApp(id);
        return;
      }
      setPendingDeleteSessionId(id);
    },
    [dropSessionFromApp],
  );

  const performDeleteSession = useCallback(() => {
    const id = pendingDeleteSessionId;
    setPendingDeleteSessionId(null);
    if (!id) return;
    dropSessionFromApp(id);
  }, [dropSessionFromApp, pendingDeleteSessionId]);

  const saveSessionTitle = useCallback(
    (title: string) => {
      if (!renameSessionId) return;
      const id = renameSessionId;
      upsertStoredSession({
        id,
        customTitle: title.trim().length > 0 ? title.trim() : null,
        updatedAt: Date.now(),
      });
      setRenameSessionId(null);
      refreshSessions();
    },
    [refreshSessions, renameSessionId],
  );

  const modalSteps = stepsModalData === "live" ? streamingSteps : stepsModalData;
  const renameTarget = renameSessionId ? sessions.find((s) => s.id === renameSessionId) : null;
  const headerChatBusy = chatPending || streamingStep !== null || streamingSteps.length > 0;
  const sidebarCols = sidebarCollapsed ? "72px minmax(0, 1fr)" : "260px minmax(0, 1fr)";

  return {
    sessions,
    activeSessionId,
    messages,
    input,
    setInput,
    streamingStep,
    streamingSteps,
    debugOpen,
    setDebugOpen,
    debugData,
    stepsModalData,
    setStepsModalData,
    isLoading,
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    renameSessionId,
    setRenameSessionId,
    editingUserIndex,
    setEditingUserIndex,
    truncateConfirm,
    setTruncateConfirm,
    pendingDeleteSessionId,
    setPendingDeleteSessionId,
    chatPending,
    ollamaModels,
    modelsLoadError,
    selectedModel,
    ollamaConnected,
    ollamaDisconnected,
    ollamaReady,
    handleModelChange,
    switchToSession,
    createSession,
    sendMessage,
    confirmTruncateAndRetry,
    toggleDebug,
    requestDeleteSession,
    performDeleteSession,
    saveSessionTitle,
    modalSteps,
    renameTarget,
    headerChatBusy,
    sidebarCols,
  };
}
