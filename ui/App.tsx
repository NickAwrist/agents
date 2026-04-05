import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Bug,
  Menu,
  MessageSquarePlus,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";
import { StepsModal } from "./components/StepsModal";
import { DebugModal } from "./components/DebugModal";
import { RenameSessionModal } from "./components/RenameSessionModal";
import type { SessionSummary, Message, MessageStep, DebugData } from "./types";
import {
  loadChatsV1,
  removeStoredSession,
  restoreAllToServer,
  upsertStoredSession,
} from "./persist/chats";

export default function App() {
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
  const debugOpenRef = useRef(false);
  debugOpenRef.current = debugOpen;

  const fetchSessions = async (): Promise<SessionSummary[]> => {
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      const list = data.sessions || [];
      setSessions(list);
      return list;
    } catch (e) {
      console.error("Failed to load sessions", e);
      return [];
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await restoreAllToServer(loadChatsV1());
      if (cancelled) return;
      const list = await fetchSessions();
      if (cancelled) return;
      const storedIds = new Set(loadChatsV1().map((s) => s.id));
      for (const s of list) {
        if (storedIds.has(s.id)) continue;
        try {
          const dRes = await fetch(`/api/sessions/${encodeURIComponent(s.id)}`);
          const d = await dRes.json();
          upsertStoredSession({
            id: s.id,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            history: d.history || [],
            modelMessages: d.modelMessages,
            customTitle: d.customTitle ?? null,
          });
        } catch (e) {
          console.error("Failed to pull session into local storage", s.id, e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createSession = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      const data = await res.json();
      upsertStoredSession({
        id: data.sessionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        history: [],
        customTitle: null,
      });
      await fetchSessions();
      await loadSession(data.sessionId);
      setSidebarOpen(false);
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };

  const loadSession = async (id: string) => {
    setActiveSessionId(id);
    setMessages([]);
    setStreamingStep(null);
    setStreamingSteps([]);

    try {
      const res = await fetch(`/api/sessions/${id}`);
      const data = await res.json();
      if (data.history) {
        setMessages(data.history);
      }
      const prev = loadChatsV1().find((s) => s.id === id);
      upsertStoredSession({
        id,
        createdAt: prev?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        history: data.history || [],
        modelMessages: data.modelMessages,
        customTitle: data.customTitle ?? prev?.customTitle ?? null,
      });
    } catch (e) {
      console.error("Failed to load session history", e);
    }
  };

  const connectStream = () => {
    if (!activeSessionId) return;

    const es = new EventSource(`/api/sessions/${activeSessionId}/stream`);
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "step") {
        setStreamingStep(data.step);
        if (data.steps) setStreamingSteps(data.steps);
      } else if (data.type === "chat_done") {
        setStreamingStep(null);
        setStreamingSteps([]);
        setMessages((prev) => [...prev, { role: "assistant", content: data.result, steps: data.steps }]);
        fetchSessions();
        if (activeSessionId) {
          fetch(`/api/sessions/${encodeURIComponent(activeSessionId)}`)
            .then((r) => r.json())
            .then((detail) => {
              upsertStoredSession({
                id: activeSessionId,
                history: detail.history || [],
                modelMessages: detail.modelMessages,
                customTitle: detail.customTitle ?? null,
                updatedAt: Date.now(),
              });
            })
            .catch((err) => console.error("Persist chat after turn failed", err));
        }
        if (debugOpenRef.current) fetchDebugData(activeSessionId);
      }
    };

    return () => {
      es.close();
    };
  };

  useEffect(() => {
    const cleanup = connectStream();
    return cleanup;
  }, [activeSessionId]);

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !activeSessionId) return;

    const msg = input.trim();
    setInput("");
    const nextHistory = [...messages, { role: "user" as const, content: msg }];
    setMessages(nextHistory);
    upsertStoredSession({ id: activeSessionId, history: nextHistory, updatedAt: Date.now() });

    await fetch(`/api/sessions/${activeSessionId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });

    if (debugOpen) fetchDebugData(activeSessionId);
  };

  const fetchDebugData = async (id: string) => {
    try {
      const res = await fetch(`/api/sessions/${id}`);
      setDebugData(await res.json());
    } catch (e) {
      console.error("Failed to load debug data", e);
    }
  };

  const toggleDebug = () => {
    if (!debugOpen && activeSessionId) fetchDebugData(activeSessionId);
    setDebugOpen(!debugOpen);
  };

  const deleteSession = async (id: string) => {
    if (!confirm("Delete this chat? This cannot be undone.")) return;
    const enc = encodeURIComponent(id);
    try {
      const res = await fetch(`/api/sessions/${enc}/delete`, { method: "POST" });
      const gone = res.status === 404;
      if (!res.ok && !gone) {
        console.error("Delete failed", res.status);
        await fetchSessions();
        return;
      }
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
        setDebugOpen(false);
        setDebugData(null);
      }
      removeStoredSession(id);
      await fetchSessions();
    } catch (e) {
      console.error("Failed to delete session", e);
      await fetchSessions();
    }
  };

  const saveSessionTitle = async (title: string) => {
    if (!renameSessionId) return;
    const id = renameSessionId;
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayTitle: title.length > 0 ? title : null }),
      });
      if (!res.ok) return;
      upsertStoredSession({
        id,
        customTitle: title.trim().length > 0 ? title.trim() : null,
        updatedAt: Date.now(),
      });
      setRenameSessionId(null);
      await fetchSessions();
    } catch (e) {
      console.error("Failed to rename session", e);
    }
  };

  const modalSteps = stepsModalData === "live" ? streamingSteps : stepsModalData;
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const renameTarget = renameSessionId ? sessions.find((s) => s.id === renameSessionId) : null;

  return (
    <div className="app-shell">
      <div className="app-layout">
        <aside
          className={[
            "app-sidebar",
            sidebarCollapsed ? "app-sidebar--collapsed" : "",
            sidebarOpen ? "app-sidebar--mobile-open" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={(id) => {
              setSidebarOpen(false);
              loadSession(id);
            }}
            onNewSession={createSession}
            onRenameSession={(id) => setRenameSessionId(id)}
            onDeleteSession={deleteSession}
            isLoading={isLoading}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
          />
        </aside>

        {sidebarOpen && <button className="app-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />}

        <main className="workspace-shell">
          <header className="workspace-header">
            <div className="workspace-header__left">
              <button className="icon-button icon-button--mobile" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
                <Menu size={18} />
              </button>

              <div className="workspace-title">
                {activeSessionId ? (
                  <div className="workspace-title__row">
                    <h1>Chat</h1>
                    <span className="session-chip" title={activeSessionId}>
                      <Bot size={12} />
                      {activeSessionId.length > 12 ? `${activeSessionId.slice(0, 12)}…` : activeSessionId}
                    </span>
                  </div>
                ) : (
                  <div className="workspace-title__row">
                    <h1>Home</h1>
                  </div>
                )}
              </div>
            </div>

            <div className="workspace-header__right">
              {activeSessionId && (
                <button type="button" onClick={toggleDebug} className="icon-button" title="Debug" aria-pressed={debugOpen}>
                  {debugOpen ? <X size={18} /> : <Bug size={18} />}
                </button>
              )}
              <button type="button" onClick={createSession} disabled={isLoading} className="primary-button">
                <Plus size={15} />
                New chat
              </button>
            </div>
          </header>

          <section className="workspace-content">
            {activeSessionId ? (
              <ChatArea
                messages={messages}
                streamingSteps={streamingSteps}
                streamingStep={streamingStep}
                input={input}
                setInput={setInput}
                onSendMessage={sendMessage}
                onViewSteps={setStepsModalData}
                sessionPreview={activeSession?.preview ?? ""}
              />
            ) : (
              <div className="empty-state empty-state--home">
                <div className="empty-state__hero">
                  <div className="empty-state__icon-wrap" aria-hidden>
                    <Sparkles size={22} className="empty-state__icon" />
                  </div>
                  <h2 className="empty-state__headline">Pick a chat or start fresh</h2>
                  <p className="empty-state__lede">
                    Your conversations live in the sidebar. Open one to continue, or create a new thread for a clean run.
                  </p>
                  <button type="button" onClick={createSession} disabled={isLoading} className="primary-button empty-state__cta">
                    <MessageSquarePlus size={16} />
                    New chat
                  </button>
                </div>
                {sessions.length > 0 && (
                  <div className="empty-state__recent">
                    <div className="empty-state__recent-label">Recent</div>
                    <ul className="empty-state__recent-list">
                      {sessions.slice(0, 5).map((s) => (
                        <li key={s.id}>
                          <button type="button" className="empty-state__recent-item" onClick={() => loadSession(s.id)}>
                            <span className="empty-state__recent-title">{s.preview || "Chat"}</span>
                            <span className="empty-state__recent-time">{new Date(s.updatedAt).toLocaleDateString()}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>

      {debugOpen && <DebugModal data={debugData} onClose={() => setDebugOpen(false)} />}
      {modalSteps && modalSteps.length > 0 && <StepsModal steps={modalSteps} onClose={() => setStepsModalData(null)} />}
      {renameSessionId && (
        <RenameSessionModal
          initialTitle={renameTarget?.preview ?? ""}
          onSave={saveSessionTitle}
          onClose={() => setRenameSessionId(null)}
        />
      )}
    </div>
  );
}
