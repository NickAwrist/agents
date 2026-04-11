import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { SessionSummary, Message, MessageStep, DebugData, OllamaModelOption } from "../types";
import { traceStepsForModal } from "../components/ExecutionTrace";
import {
  createSessionApi,
  deleteSessionApi,
  fetchSession,
  fetchSessionSummaries,
  patchSessionApi,
} from "../persist/sessions";
import { fetchAgents, fetchDefaultChatAgent } from "../persist/agents";
import { loadPreferredModel, savePreferredModel } from "../persist/modelPreference";
import { loadUserSettings, updateUserSettings, type UserSettings } from "../persist/userSettings";
import { readSseBlocks } from "../lib/readSseBlocks";

const OLLAMA_HEALTH_POLL_MS = 3000;

function newEphemeralSessionId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function useChatApp() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streamingStep, setStreamingStep] = useState<MessageStep | null>(null);
  const [streamingSteps, setStreamingSteps] = useState<MessageStep[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
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
  const [serverDefaultModel, setServerDefaultModel] = useState("gemma4:e4b");
  const [selectedModel, setSelectedModel] = useState(() => loadPreferredModel("gemma4:e4b"));
  const [chatAgents, setChatAgents] = useState<{ name: string }[]>([]);
  const [selectedSessionAgent, setSelectedSessionAgent] = useState("general_agent");
  const [serverDefaultChatAgent, setServerDefaultChatAgent] = useState("general_agent");
  const [ollamaConnected, setOllamaConnected] = useState<boolean | null>(null);
  const [isEphemeral, setIsEphemeral] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings>(() => loadUserSettings());
  const userSettingsRef = useRef(userSettings);
  userSettingsRef.current = userSettings;
  const isEphemeralRef = useRef(false);
  isEphemeralRef.current = isEphemeral;
  const debugOpenRef = useRef(false);
  debugOpenRef.current = debugOpen;
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const modelMessagesRef = useRef<Array<Record<string, unknown>> | null>(null);
  const loadGenRef = useRef(0);
  const activeSessionIdRef = useRef<string | null>(null);
  activeSessionIdRef.current = activeSessionId;
  const selectedSessionAgentRef = useRef(selectedSessionAgent);
  selectedSessionAgentRef.current = selectedSessionAgent;

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
    let cancelled = false;
    (async () => {
      try {
        const [list, def] = await Promise.all([fetchAgents(), fetchDefaultChatAgent()]);
        if (cancelled) return;
        setChatAgents(list.map((a) => ({ name: a.name })));
        setServerDefaultChatAgent(def);
      } catch {
        if (!cancelled) {
          setChatAgents([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const list = await fetchSessionSummaries();
      setSessions(list);
    } catch (e) {
      console.error(e);
      setSessions([]);
    }
  }, []);

  const refreshAgentDefaults = useCallback(async () => {
    try {
      const [list, def] = await Promise.all([fetchAgents(), fetchDefaultChatAgent()]);
      setChatAgents(list.map((a) => ({ name: a.name })));
      setServerDefaultChatAgent(def);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await refreshSessions();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSessions]);

  useEffect(() => {
    if (!activeSessionId) return;
    if (isEphemeral) {
      const names = new Set(ollamaModels.map((m) => m.name));
      const pref = loadPreferredModel(serverDefaultModel);
      let next = pref;
      if (names.size > 0 && !names.has(next)) {
        next = names.has(serverDefaultModel) ? serverDefaultModel : (ollamaModels[0]?.name ?? next);
      }
      setSelectedModel(next);
      return;
    }
    let cancelled = false;
    (async () => {
      const stored = await fetchSession(activeSessionId);
      if (cancelled) return;
      const preference = stored?.model?.trim() || loadPreferredModel(serverDefaultModel);
      const names = new Set(ollamaModels.map((m) => m.name));
      let next = preference;
      if (names.size > 0 && !names.has(next)) {
        next = names.has(serverDefaultModel) ? serverDefaultModel : (ollamaModels[0]?.name ?? next);
      }
      setSelectedModel(next);
      const an = stored?.agentName?.trim();
      setSelectedSessionAgent(an && an.length > 0 ? an : serverDefaultChatAgent);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, isEphemeral, ollamaModels, serverDefaultModel, serverDefaultChatAgent]);

  const handleSessionAgentChange = useCallback(
    async (name: string) => {
      setSelectedSessionAgent(name);
      if (isEphemeralRef.current) return;
      const sid = activeSessionIdRef.current;
      if (!sid) return;
      try {
        await patchSessionApi(sid, { agentName: name });
        await refreshSessions();
      } catch (e) {
        console.error(e);
      }
    },
    [refreshSessions],
  );

  const handleModelChange = useCallback(
    async (model: string) => {
      setSelectedModel(model);
      savePreferredModel(model);
      if (isEphemeralRef.current) return;
      const sid = activeSessionIdRef.current;
      if (sid) {
        try {
          await patchSessionApi(sid, { model });
          await refreshSessions();
        } catch (e) {
          console.error(e);
        }
      }
    },
    [refreshSessions],
  );

  const loadSession = useCallback(async (id: string) => {
    const gen = ++loadGenRef.current;
    setActiveSessionId(id);
    setMessages([]);
    setStreamingStep(null);
    setStreamingSteps([]);
    setEditingUserIndex(null);
    setTruncateConfirm(null);
    modelMessagesRef.current = null;
    try {
      const stored = await fetchSession(id);
      if (gen !== loadGenRef.current) return;
      if (stored?.history?.length) setMessages(stored.history);
      modelMessagesRef.current = stored?.modelMessages ?? null;
    } catch (e) {
      if (gen !== loadGenRef.current) return;
      console.error(e);
    }
  }, []);

  const switchToSession = useCallback(
    async (id: string) => {
      const curId = activeSessionIdRef.current;
      const wasEphemeral = isEphemeralRef.current;
      if (curId && curId !== id && !wasEphemeral && messages.length === 0) {
        try {
          await deleteSessionApi(curId);
        } catch (e) {
          console.error(e);
        }
        await refreshSessions();
      }
      setIsEphemeral(false);
      await loadSession(id);
    },
    [loadSession, messages.length, refreshSessions],
  );

  const createSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const curId = activeSessionIdRef.current;
      if (curId && !isEphemeralRef.current && messages.length === 0) {
        try {
          await deleteSessionApi(curId);
        } catch (e) {
          console.error(e);
        }
      }
      setIsEphemeral(false);
      let agentForNewChat = serverDefaultChatAgent;
      try {
        agentForNewChat = await fetchDefaultChatAgent();
        setServerDefaultChatAgent(agentForNewChat);
      } catch {
        /* use serverDefaultChatAgent / last known */
      }
      const { id } = await createSessionApi({
        model: selectedModel,
        agentName: agentForNewChat,
      });
      await refreshSessions();
      await loadSession(id);
      setSidebarOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [loadSession, messages.length, refreshSessions, selectedModel, serverDefaultChatAgent]);

  const createEphemeralSession = useCallback(async () => {
    const curId = activeSessionIdRef.current;
    if (curId && !isEphemeralRef.current && messages.length === 0) {
      try { await deleteSessionApi(curId); } catch (e) { console.error(e); }
      await refreshSessions();
    }
    const id = newEphemeralSessionId();
    setActiveSessionId(id);
    setMessages([]);
    setStreamingStep(null);
    setStreamingSteps([]);
    setStreamingContent("");
    setStreamingThinking("");
    setEditingUserIndex(null);
    setTruncateConfirm(null);
    setIsEphemeral(true);
    modelMessagesRef.current = null;
    setSidebarOpen(false);
    setSelectedSessionAgent(serverDefaultChatAgent);
  }, [messages.length, refreshSessions, serverDefaultChatAgent]);

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
      const agentName = selectedSessionAgentRef.current;
      const spRes = await fetch(`/api/agent/system-prompt?${new URLSearchParams({ agentName })}`);
      const spJson = (await spRes.json()) as { systemPrompt?: string };
      const stored = await fetchSession(id);
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
      const sid = activeSessionIdRef.current;
      if (!messageText.trim() || !sid) return;
      if (!ollamaReady) return;

      const msg = messageText.trim();
      const ephemeral = isEphemeralRef.current;
      setChatPending(true);
      setStreamingStep(null);
      setStreamingSteps([]);
      setStreamingContent("");
      setStreamingThinking("");

      const nextHistory: Message[] = [...priorMessages, { role: "user" as const, content: msg }];
      setMessages(nextHistory);

      const failWithAssistantError = async (errText: string) => {
        const failedHistory: Message[] = [
          ...priorMessages,
          { role: "user", content: msg },
          { role: "assistant", content: `Error: ${errText}` },
        ];
        setMessages(failedHistory);
        if (!ephemeral) {
          try {
            await patchSessionApi(sid, {
              history: failedHistory,
              modelMessages: options.rebuildModelMessages ? null : modelMessagesRef.current,
            });
          } catch (e) {
            console.error(e);
          }
          await refreshSessions();
        }
      };

      const modelMessagesPayload = options.rebuildModelMessages
        ? null
        : modelMessagesRef.current;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        let res: Response;
        try {
          const u = userSettingsRef.current;
          const chatBody: Record<string, unknown> = {
            message: msg,
            history: priorMessages,
            model: selectedModel,
            modelMessages: modelMessagesPayload,
            personalization: {
              name: u.name,
              location: u.location,
              preferredFormats: u.preferredFormats,
            },
          };
          if (ephemeral) {
            chatBody.ephemeral = true;
            chatBody.agentName = selectedSessionAgentRef.current;
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
              if (cd && agent === selectedSessionAgentRef.current) setStreamingContent((prev) => prev + cd);
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
                setMessages([
                  ...priorMessages,
                  { role: "user", content: msg },
                  { role: "assistant", content: assistantContent, steps },
                ]);
                if (Array.isArray(data.modelMessages)) {
                  modelMessagesRef.current = data.modelMessages as Array<Record<string, unknown>>;
                }
              } else {
                try {
                  const s = await fetchSession(sid);
                  if (s?.history?.length) setMessages(s.history);
                  modelMessagesRef.current = s?.modelMessages ?? null;
                } catch (e) {
                  console.error(e);
                  const assistantContent = typeof data.result === "string" ? data.result : "";
                  const steps = (Array.isArray(data.steps) ? data.steps : []) as MessageStep[];
                  setMessages([
                    ...priorMessages,
                    { role: "user", content: msg },
                    { role: "assistant", content: assistantContent, steps },
                  ]);
                }
                await refreshSessions();
              }
              if (debugOpenRef.current) void fetchDebugData(sid);
            } else if (data.type === "chat_aborted") {
              setStreamingStep(null);
              setStreamingSteps([]);
              setStreamingContent("");
              setStreamingThinking("");
              const hist = Array.isArray(data.history) ? (data.history as Message[]) : [];
              if (hist.length) setMessages(hist);
              if (!ephemeral) {
                try {
                  const s = await fetchSession(sid);
                  if (s?.history?.length) setMessages(s.history);
                  modelMessagesRef.current = s?.modelMessages ?? null;
                } catch (e) {
                  console.error(e);
                }
                await refreshSessions();
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
    [fetchDebugData, ollamaReady, refreshSessions, selectedModel],
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

    setMessages((prev) => {
      const halted: Message[] = [
        ...prev,
        { role: "assistant" as const, content: "*Response halted by user.*" },
      ];
      if (!isEphemeralRef.current) {
        const sid = activeSessionIdRef.current;
        if (sid) {
          void patchSessionApi(sid, { history: halted }).catch((e) => console.error(e));
        }
      }
      return halted;
    });
  }, []);

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
    async (id: string) => {
      try {
        await deleteSessionApi(id);
      } catch (e) {
        console.error(e);
      }
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
        setDebugOpen(false);
        setDebugData(null);
        setEditingUserIndex(null);
        setTruncateConfirm(null);
      }
      await refreshSessions();
    },
    [activeSessionId, refreshSessions],
  );

  const requestDeleteSession = useCallback(
    async (id: string) => {
      if (id === activeSessionId) {
        if (messages.length === 0) {
          await dropSessionFromApp(id);
          return;
        }
        setPendingDeleteSessionId(id);
        return;
      }
      try {
        const full = await fetchSession(id);
        if (!full?.history?.length) {
          await dropSessionFromApp(id);
          return;
        }
      } catch {
        setPendingDeleteSessionId(id);
        return;
      }
      setPendingDeleteSessionId(id);
    },
    [activeSessionId, dropSessionFromApp, messages.length],
  );

  const performDeleteSession = useCallback(async () => {
    const id = pendingDeleteSessionId;
    setPendingDeleteSessionId(null);
    if (!id) return;
    await dropSessionFromApp(id);
  }, [dropSessionFromApp, pendingDeleteSessionId]);

  const goToHome = useCallback(async () => {
    const curId = activeSessionIdRef.current;
    if (curId && !isEphemeralRef.current && messages.length === 0) {
      try {
        await deleteSessionApi(curId);
      } catch (e) {
        console.error(e);
      }
      await refreshSessions();
    }
    setIsEphemeral(false);
    setActiveSessionId(null);
    setMessages([]);
    setStreamingStep(null);
    setStreamingSteps([]);
    setStreamingContent("");
    setStreamingThinking("");
    setEditingUserIndex(null);
    setTruncateConfirm(null);
    setStepsModalData(null);
    setDebugOpen(false);
    setDebugData(null);
    setSidebarOpen(false);
    setSelectedSessionAgent(serverDefaultChatAgent);
  }, [messages.length, refreshSessions, serverDefaultChatAgent]);

  const saveSessionTitle = useCallback(
    async (title: string) => {
      if (!renameSessionId) return;
      const id = renameSessionId;
      try {
        await patchSessionApi(id, {
          customTitle: title.trim().length > 0 ? title.trim() : null,
        });
      } catch (e) {
        console.error(e);
      }
      setRenameSessionId(null);
      await refreshSessions();
    },
    [refreshSessions, renameSessionId],
  );

  const modalSteps = traceStepsForModal(stepsModalData, streamingSteps, streamingStep);
  const renameTarget = renameSessionId ? sessions.find((s) => s.id === renameSessionId) : null;
  const headerChatBusy = chatPending || streamingStep !== null || streamingSteps.length > 0;
  const sidebarCols = sidebarCollapsed ? "72px minmax(0, 1fr)" : "260px minmax(0, 1fr)";


  const saveUserSettings = useCallback(async (settings: UserSettings) => {
    const updated = updateUserSettings(settings);
    setUserSettings(updated);
  }, []);

  return {
    sessions,
    activeSessionId,
    messages,
    input,
    setInput,
    streamingStep,
    streamingSteps,
    streamingContent,
    streamingThinking,
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
    chatAgents,
    selectedSessionAgent,
    handleSessionAgentChange,
    refreshAgentDefaults,
    ollamaConnected,
    ollamaDisconnected,
    ollamaReady,
    handleModelChange,
    isEphemeral,
    userSettings,
    saveUserSettings,
    switchToSession,
    createSession,
    createEphemeralSession,
    goToHome,
    sendMessage,
    stopGeneration,
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
