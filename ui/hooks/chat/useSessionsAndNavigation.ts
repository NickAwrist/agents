import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type {
  DebugData,
  Message,
  SessionSummary,
  TraceModalSelection,
  TruncateConfirmState,
} from "../../types";
import {
  createSessionApi,
  deleteSessionApi,
  fetchSession,
  fetchSessionSummaries,
  patchSessionApi,
} from "../../persist/sessions";
import { fetchDefaultChatAgent } from "../../persist/agents";
import type { UserSettings } from "../../persist/userSettings";
import type { OllamaModelOption } from "../../types";
import { loadUserSettings } from "../../persist/userSettings";
import { effectiveDefaultChatModel, newEphemeralSessionId } from "./sessionUtils";

type Args = {
  ollamaModels: OllamaModelOption[];
  serverDefaultModel: string;
  serverDefaultChatAgent: string;
  setServerDefaultChatAgent: Dispatch<SetStateAction<string>>;
  userSettingsRef: MutableRefObject<UserSettings>;
  userSettingsDefaultModel: string;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setEditingUserIndex: Dispatch<SetStateAction<number | null>>;
  setTruncateConfirm: Dispatch<SetStateAction<TruncateConfirmState>>;
  setStepsModalData: Dispatch<SetStateAction<TraceModalSelection>>;
  setDebugOpen: Dispatch<SetStateAction<boolean>>;
  setDebugData: Dispatch<SetStateAction<DebugData | null>>;
  resetStreamingUi: () => void;
  modelMessagesRef: MutableRefObject<Array<Record<string, unknown>> | null>;
  activeSessionIdRef: MutableRefObject<string | null>;
  isEphemeralRef: MutableRefObject<boolean>;
  selectedSessionAgentRef: MutableRefObject<string>;
};

export function useSessionsAndNavigation(p: Args) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isEphemeral, setIsEphemeral] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(() =>
    effectiveDefaultChatModel(loadUserSettings(), "gemma4:e4b"),
  );
  const [selectedSessionAgent, setSelectedSessionAgent] = useState("general_agent");

  const loadGenRef = useRef(0);

  p.activeSessionIdRef.current = activeSessionId;
  p.isEphemeralRef.current = isEphemeral;
  p.selectedSessionAgentRef.current = selectedSessionAgent;

  const refreshSessions = useCallback(async () => {
    try {
      const list = await fetchSessionSummaries();
      setSessions(list);
    } catch (e) {
      console.error(e);
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await refreshSessions();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSessions]);

  useEffect(() => {
    if (!activeSessionId) return;
    if (isEphemeral) {
      const names = new Set(p.ollamaModels.map((m) => m.name));
      const pref = effectiveDefaultChatModel(p.userSettingsRef.current, p.serverDefaultModel);
      let next = pref;
      if (names.size > 0 && !names.has(next)) {
        next = names.has(p.serverDefaultModel)
          ? p.serverDefaultModel
          : (p.ollamaModels[0]?.name ?? next);
      }
      setSelectedModel(next);
      return;
    }
    let cancelled = false;
    void (async () => {
      const stored = await fetchSession(activeSessionId);
      if (cancelled) return;
      const preference =
        stored?.model?.trim() ||
        effectiveDefaultChatModel(p.userSettingsRef.current, p.serverDefaultModel);
      const names = new Set(p.ollamaModels.map((m) => m.name));
      let next = preference;
      if (names.size > 0 && !names.has(next)) {
        next = names.has(p.serverDefaultModel)
          ? p.serverDefaultModel
          : (p.ollamaModels[0]?.name ?? next);
      }
      setSelectedModel(next);
      const an = stored?.agentName?.trim();
      setSelectedSessionAgent(an && an.length > 0 ? an : p.serverDefaultChatAgent);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeSessionId,
    isEphemeral,
    p.ollamaModels,
    p.serverDefaultModel,
    p.serverDefaultChatAgent,
    p.userSettingsRef,
    p.userSettingsDefaultModel,
  ]);

  const handleSessionAgentChange = useCallback(
    async (name: string) => {
      setSelectedSessionAgent(name);
      if (p.isEphemeralRef.current) return;
      const sid = p.activeSessionIdRef.current;
      if (!sid) return;
      try {
        await patchSessionApi(sid, { agentName: name });
        await refreshSessions();
      } catch (e) {
        console.error(e);
      }
    },
    [p.activeSessionIdRef, p.isEphemeralRef, refreshSessions],
  );

  const handleModelChange = useCallback(
    async (model: string) => {
      setSelectedModel(model);
      if (p.isEphemeralRef.current) return;
      const sid = p.activeSessionIdRef.current;
      if (sid) {
        try {
          await patchSessionApi(sid, { model });
          await refreshSessions();
        } catch (e) {
          console.error(e);
        }
      }
    },
    [p.activeSessionIdRef, p.isEphemeralRef, refreshSessions],
  );

  const loadSession = useCallback(
    async (id: string) => {
      const gen = ++loadGenRef.current;
      setActiveSessionId(id);
      p.setMessages([]);
      p.resetStreamingUi();
      p.setEditingUserIndex(null);
      p.setTruncateConfirm(null);
      p.modelMessagesRef.current = null;
      try {
        const stored = await fetchSession(id);
        if (gen !== loadGenRef.current) return;
        if (stored?.history?.length) p.setMessages(stored.history);
        p.modelMessagesRef.current = stored?.modelMessages ?? null;
      } catch (e) {
        if (gen !== loadGenRef.current) return;
        console.error(e);
      }
    },
    [p.setMessages, p.resetStreamingUi, p.setEditingUserIndex, p.setTruncateConfirm, p.modelMessagesRef],
  );

  const switchToSession = useCallback(
    async (id: string) => {
      const curId = p.activeSessionIdRef.current;
      const wasEphemeral = p.isEphemeralRef.current;
      if (curId && curId !== id && !wasEphemeral && p.messages.length === 0) {
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
    [loadSession, p.activeSessionIdRef, p.isEphemeralRef, p.messages.length, refreshSessions],
  );

  const createSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const curId = p.activeSessionIdRef.current;
      if (curId && !p.isEphemeralRef.current && p.messages.length === 0) {
        try {
          await deleteSessionApi(curId);
        } catch (e) {
          console.error(e);
        }
      }
      setIsEphemeral(false);
      let agentForNewChat = p.serverDefaultChatAgent;
      try {
        agentForNewChat = await fetchDefaultChatAgent();
        p.setServerDefaultChatAgent(agentForNewChat);
      } catch {
        /* use last known */
      }
      const names = new Set(p.ollamaModels.map((m) => m.name));
      let modelForNew = effectiveDefaultChatModel(p.userSettingsRef.current, p.serverDefaultModel);
      if (names.size > 0 && !names.has(modelForNew)) {
        modelForNew = names.has(p.serverDefaultModel)
          ? p.serverDefaultModel
          : (p.ollamaModels[0]?.name ?? modelForNew);
      }
      const { id } = await createSessionApi({
        model: modelForNew,
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
  }, [
    loadSession,
    p.activeSessionIdRef,
    p.isEphemeralRef,
    p.messages.length,
    p.ollamaModels,
    p.serverDefaultChatAgent,
    p.serverDefaultModel,
    p.setServerDefaultChatAgent,
    p.userSettingsRef,
    refreshSessions,
  ]);

  const createEphemeralSession = useCallback(async () => {
    const curId = p.activeSessionIdRef.current;
    if (curId && !p.isEphemeralRef.current && p.messages.length === 0) {
      try {
        await deleteSessionApi(curId);
      } catch (e) {
        console.error(e);
      }
      await refreshSessions();
    }
    const id = newEphemeralSessionId();
    setActiveSessionId(id);
    p.setMessages([]);
    p.resetStreamingUi();
    p.setEditingUserIndex(null);
    p.setTruncateConfirm(null);
    setIsEphemeral(true);
    p.modelMessagesRef.current = null;
    setSidebarOpen(false);
    setSelectedSessionAgent(p.serverDefaultChatAgent);
  }, [
    p.activeSessionIdRef,
    p.isEphemeralRef,
    p.messages.length,
    p.modelMessagesRef,
    p.serverDefaultChatAgent,
    p.setMessages,
    p.resetStreamingUi,
    p.setEditingUserIndex,
    p.setTruncateConfirm,
    refreshSessions,
  ]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const goToHome = useCallback(async () => {
    const curId = p.activeSessionIdRef.current;
    if (curId && !p.isEphemeralRef.current && p.messages.length === 0) {
      try {
        await deleteSessionApi(curId);
      } catch (e) {
        console.error(e);
      }
      await refreshSessions();
    }
    setIsEphemeral(false);
    setActiveSessionId(null);
    p.setMessages([]);
    p.resetStreamingUi();
    p.setEditingUserIndex(null);
    p.setTruncateConfirm(null);
    p.setStepsModalData(null);
    p.setDebugOpen(false);
    p.setDebugData(null);
    setSidebarOpen(false);
    setSelectedSessionAgent(p.serverDefaultChatAgent);
  }, [
    p.activeSessionIdRef,
    p.isEphemeralRef,
    p.messages.length,
    p.serverDefaultChatAgent,
    p.setDebugData,
    p.setDebugOpen,
    p.setEditingUserIndex,
    p.setMessages,
    p.setStepsModalData,
    p.resetStreamingUi,
    p.setTruncateConfirm,
    refreshSessions,
  ]);

  const dropSessionFromApp = useCallback(
    async (id: string) => {
      try {
        await deleteSessionApi(id);
      } catch (e) {
        console.error(e);
      }
      if (activeSessionId === id) {
        setActiveSessionId(null);
        p.setMessages([]);
        p.setDebugOpen(false);
        p.setDebugData(null);
        p.setEditingUserIndex(null);
        p.setTruncateConfirm(null);
      }
      await refreshSessions();
    },
    [
      activeSessionId,
      p.setDebugData,
      p.setDebugOpen,
      p.setEditingUserIndex,
      p.setMessages,
      p.setTruncateConfirm,
      refreshSessions,
    ],
  );

  const requestDeleteSession = useCallback(
    async (id: string) => {
      if (id === activeSessionId) {
        if (p.messages.length === 0) {
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
    [activeSessionId, dropSessionFromApp, p.messages.length],
  );

  const performDeleteSession = useCallback(async () => {
    const id = pendingDeleteSessionId;
    setPendingDeleteSessionId(null);
    if (!id) return;
    await dropSessionFromApp(id);
  }, [dropSessionFromApp, pendingDeleteSessionId]);

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

  const renameTarget = renameSessionId ? sessions.find((s) => s.id === renameSessionId) : null;
  const sidebarCols = sidebarCollapsed ? "72px minmax(0, 1fr)" : "260px minmax(0, 1fr)";

  return {
    sessions,
    activeSessionId,
    isEphemeral,
    isLoading,
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
    renameSessionId,
    setRenameSessionId,
    pendingDeleteSessionId,
    setPendingDeleteSessionId,
    selectedModel,
    selectedSessionAgent,
    refreshSessions,
    handleSessionAgentChange,
    handleModelChange,
    switchToSession,
    createSession,
    createEphemeralSession,
    goToHome,
    saveSessionTitle,
    renameTarget,
    sidebarCols,
    requestDeleteSession,
    performDeleteSession,
  };
}
