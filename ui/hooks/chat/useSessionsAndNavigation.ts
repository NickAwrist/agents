import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { fetchDefaultChatAgent } from "../../persist/agents";
import {
  createSessionApi,
  deleteSessionApi,
  fetchSession,
  fetchSessionSummaries,
  patchSessionApi,
} from "../../persist/sessions";
import type { UserSettings } from "../../persist/userSettings";
import { loadUserSettings } from "../../persist/userSettings";
import type {
  DebugData,
  Message,
  SessionSummary,
  TraceModalSelection,
  TruncateConfirmState,
} from "../../types";
import type { OllamaModelOption } from "../../types";
import type { ChatFlightApi } from "./chatTypes";
import {
  effectiveDefaultChatModel,
  newEphemeralSessionId,
} from "./sessionUtils";

const ACTIVE_SESSION_STORAGE_KEY = "activeSessionId";
const CHAT_PATH_PREFIX = "/chat/";

function sessionIdFromUrl(): string | null {
  const { pathname } = window.location;
  if (pathname.startsWith(CHAT_PATH_PREFIX)) {
    const id = decodeURIComponent(pathname.slice(CHAT_PATH_PREFIX.length));
    return id || null;
  }
  return null;
}

function pushSessionUrl(id: string | null) {
  const target = id ? `${CHAT_PATH_PREFIX}${encodeURIComponent(id)}` : "/";
  if (window.location.pathname !== target) {
    window.history.pushState({ sessionId: id }, "", target);
  }
}

function replaceSessionUrl(id: string | null) {
  const target = id ? `${CHAT_PATH_PREFIX}${encodeURIComponent(id)}` : "/";
  if (window.location.pathname !== target) {
    window.history.replaceState({ sessionId: id }, "", target);
  }
}

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
  chatFlightRef: MutableRefObject<ChatFlightApi | null>;
};

export function useSessionsAndNavigation(p: Args) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    sessionIdFromUrl,
  );
  const [isEphemeral, setIsEphemeral] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<
    string | null
  >(null);
  const [selectedModel, setSelectedModel] = useState(() =>
    effectiveDefaultChatModel(loadUserSettings(), "gemma4:e4b"),
  );
  const [selectedSessionAgent, setSelectedSessionAgent] =
    useState("general_agent");
  const [sessionDirectory, setSessionDirectory] = useState("");
  const sessionDirectoryRef = useRef("");

  const loadGenRef = useRef(0);
  const restoreDoneRef = useRef(false);

  p.activeSessionIdRef.current = activeSessionId;
  p.isEphemeralRef.current = isEphemeral;
  p.selectedSessionAgentRef.current = selectedSessionAgent;
  sessionDirectoryRef.current = sessionDirectory;

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
    if (!activeSessionId) return;
    if (isEphemeral) {
      const names = new Set(p.ollamaModels.map((m) => m.name));
      const pref = effectiveDefaultChatModel(
        p.userSettingsRef.current,
        p.serverDefaultModel,
      );
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
        effectiveDefaultChatModel(
          p.userSettingsRef.current,
          p.serverDefaultModel,
        );
      const names = new Set(p.ollamaModels.map((m) => m.name));
      let next = preference;
      if (names.size > 0 && !names.has(next)) {
        next = names.has(p.serverDefaultModel)
          ? p.serverDefaultModel
          : (p.ollamaModels[0]?.name ?? next);
      }
      setSelectedModel(next);
      const an = stored?.agentName?.trim();
      setSelectedSessionAgent(
        an && an.length > 0 ? an : p.serverDefaultChatAgent,
      );
      const sd =
        stored?.sessionDirectory != null &&
        String(stored.sessionDirectory).trim()
          ? String(stored.sessionDirectory).trim()
          : "";
      setSessionDirectory(sd);
      sessionDirectoryRef.current = sd;
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

  const setSessionDirectoryDraft = useCallback((next: string) => {
    setSessionDirectory(next);
    sessionDirectoryRef.current = next;
  }, []);

  const persistSessionDirectory = useCallback(async () => {
    if (p.isEphemeralRef.current) return;
    const sid = p.activeSessionIdRef.current;
    if (!sid) return;
    const trimmed = sessionDirectoryRef.current.trim();
    try {
      await patchSessionApi(sid, {
        sessionDirectory: trimmed.length > 0 ? trimmed : null,
      });
      await refreshSessions();
    } catch (e) {
      console.error(e);
    }
  }, [p.activeSessionIdRef, p.isEphemeralRef, refreshSessions]);

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
      const cf = p.chatFlightRef.current;
      if (cf?.shouldPreserveMessages(id)) {
        p.resetStreamingUi();
        p.setMessages(cf.getTurnSnapshot() ?? []);
        p.setEditingUserIndex(null);
        p.setTruncateConfirm(null);
        try {
          const stored = await fetchSession(id);
          if (gen !== loadGenRef.current) return;
          p.modelMessagesRef.current = stored?.modelMessages ?? null;
          const sd =
            stored?.sessionDirectory != null &&
            String(stored.sessionDirectory).trim()
              ? String(stored.sessionDirectory).trim()
              : "";
          setSessionDirectory(sd);
          sessionDirectoryRef.current = sd;
        } catch (e) {
          if (gen !== loadGenRef.current) return;
          console.error(e);
        }
        cf.hydrateStreaming();
        return;
      }

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
        const sd =
          stored?.sessionDirectory != null &&
          String(stored.sessionDirectory).trim()
            ? String(stored.sessionDirectory).trim()
            : "";
        setSessionDirectory(sd);
        sessionDirectoryRef.current = sd;
      } catch (e) {
        if (gen !== loadGenRef.current) return;
        console.error(e);
      }

      try {
        const statusRes = await fetch(
          `/api/chat/active/${encodeURIComponent(id)}`,
        );
        if (gen !== loadGenRef.current) return;
        const status = (await statusRes.json()) as {
          active?: boolean;
          requestId?: string;
        };
        if (status.active && status.requestId) {
          p.chatFlightRef.current?.reconnectToStream(id, status.requestId);
        }
      } catch {
        /* no active generation — normal case */
      }
    },
    [
      p.chatFlightRef,
      p.setMessages,
      p.resetStreamingUi,
      p.setEditingUserIndex,
      p.setTruncateConfirm,
      p.modelMessagesRef,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refreshSessions();
        if (cancelled) return;
        const restoredId =
          sessionIdFromUrl() ||
          sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
        if (restoredId) {
          const stored = await fetchSession(restoredId);
          if (cancelled) return;
          if (stored) {
            await loadSession(restoredId);
            replaceSessionUrl(restoredId);
          } else {
            setActiveSessionId(null);
            sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
            replaceSessionUrl(null);
          }
        }
      } finally {
        if (!cancelled) restoreDoneRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSessions, loadSession]);

  useEffect(() => {
    if (activeSessionId && !isEphemeral) {
      sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSessionId);
      replaceSessionUrl(activeSessionId);
      return;
    }
    if (!restoreDoneRef.current) return;
    sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    replaceSessionUrl(null);
  }, [activeSessionId, isEphemeral]);

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
      pushSessionUrl(id);
      await loadSession(id);
    },
    [
      loadSession,
      p.activeSessionIdRef,
      p.isEphemeralRef,
      p.messages.length,
      refreshSessions,
    ],
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
      let modelForNew = effectiveDefaultChatModel(
        p.userSettingsRef.current,
        p.serverDefaultModel,
      );
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
      pushSessionUrl(id);
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
    setSessionDirectory("");
    sessionDirectoryRef.current = "";
    pushSessionUrl(null);
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

  useEffect(() => {
    const onPopState = () => {
      const urlId = sessionIdFromUrl();
      if (urlId) {
        setIsEphemeral(false);
        void loadSession(urlId);
      } else {
        setActiveSessionId(null);
        setIsEphemeral(false);
        setSessionDirectory("");
        sessionDirectoryRef.current = "";
        p.setMessages([]);
        p.resetStreamingUi();
        p.setEditingUserIndex(null);
        p.setTruncateConfirm(null);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [
    loadSession,
    p.setMessages,
    p.resetStreamingUi,
    p.setEditingUserIndex,
    p.setTruncateConfirm,
  ]);

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
    setSessionDirectory("");
    sessionDirectoryRef.current = "";
    pushSessionUrl(null);
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
        setSessionDirectory("");
        sessionDirectoryRef.current = "";
        p.setMessages([]);
        p.setDebugOpen(false);
        p.setDebugData(null);
        p.setEditingUserIndex(null);
        p.setTruncateConfirm(null);
        replaceSessionUrl(null);
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

  const renameTarget = renameSessionId
    ? sessions.find((s) => s.id === renameSessionId)
    : null;
  const sidebarCols = sidebarCollapsed
    ? "72px minmax(0, 1fr)"
    : "260px minmax(0, 1fr)";

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
    sessionDirectory,
    sessionDirectoryRef,
    refreshSessions,
    handleSessionAgentChange,
    setSessionDirectoryDraft,
    persistSessionDirectory,
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
