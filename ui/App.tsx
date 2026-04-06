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
import { cx, iconButton, primaryButton } from "./styles";
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
    <div className="h-screen overflow-hidden">
      <div className="grid h-full grid-cols-[260px_minmax(0,1fr)] max-[900px]:grid-cols-1">
        <aside
          className={cx(
            "min-h-0 min-w-0 border-r border-border-subtle bg-background",
            sidebarCollapsed && "w-[72px]",
            "max-[900px]:fixed max-[900px]:top-0 max-[900px]:bottom-0 max-[900px]:left-0 max-[900px]:z-30 max-[900px]:w-[min(85vw,300px)] max-[900px]:translate-x-[-100%] max-[900px]:shadow-[4px_0_24px_rgba(0,0,0,0.35)] max-[900px]:transition-transform max-[900px]:duration-150",
            sidebarOpen && "max-[900px]:translate-x-0",
            sidebarCollapsed && "max-[900px]:w-[min(85vw,300px)]",
          )}
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

        {sidebarOpen && (
          <button
            className="fixed inset-0 z-20 border-0 bg-black/45 max-[900px]:block min-[901px]:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          />
        )}

        <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-background">
          <header className="flex items-center justify-between gap-3 border-b border-border-subtle bg-background px-4 py-2.5 max-[900px]:px-3.5 max-[640px]:flex-col max-[640px]:items-start">
            <div className="flex items-center gap-2.5 max-[640px]:w-full">
              <button
                className={cx(iconButton, "hidden max-[900px]:inline-flex")}
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Menu size={18} />
              </button>

              <div>
                {activeSessionId ? (
                  <div className="mt-0.5 flex items-center gap-2.5">
                    <h1 className="m-0 text-[0.9375rem] font-semibold tracking-[-0.02em] text-foreground">Chat</h1>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-md bg-transparent px-2 py-1 text-[0.75rem] font-medium text-muted-foreground"
                      title={activeSessionId}
                    >
                      <Bot size={12} />
                      {activeSessionId.length > 12 ? `${activeSessionId.slice(0, 12)}…` : activeSessionId}
                    </span>
                  </div>
                ) : (
                  <div className="mt-0.5 flex items-center gap-2.5">
                    <h1 className="m-0 text-[0.9375rem] font-semibold tracking-[-0.02em] text-foreground">Home</h1>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5 max-[900px]:flex-wrap max-[900px]:justify-end max-[640px]:w-full">
              {activeSessionId && (
                <button type="button" onClick={toggleDebug} className={iconButton} title="Debug" aria-pressed={debugOpen}>
                  {debugOpen ? <X size={18} /> : <Bug size={18} />}
                </button>
              )}
              <button type="button" onClick={createSession} disabled={isLoading} className={primaryButton}>
                <Plus size={15} />
                New chat
              </button>
            </div>
          </header>

          <section className="flex min-h-0 overflow-hidden">
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
              <div className="mx-auto flex h-full w-full max-w-[28rem] flex-col items-center justify-center gap-8 px-6 pb-12 pt-8">
                <div className="flex flex-col items-center text-center">
                  <div className="mb-5 flex size-[52px] items-center justify-center rounded-[14px] bg-[rgba(34,197,94,0.12)] text-accent" aria-hidden>
                    <Sparkles size={22} />
                  </div>
                  <h2 className="mb-2.5 text-[1.375rem] font-semibold leading-[1.25] tracking-[-0.02em] text-foreground">
                    Pick a chat or start fresh
                  </h2>
                  <p className="m-0 max-w-[34ch] text-[0.9375rem] leading-[1.65] text-muted-foreground">
                    Your conversations live in the sidebar. Open one to continue, or create a new thread for a clean run.
                  </p>
                  <button type="button" onClick={createSession} disabled={isLoading} className={cx(primaryButton, "mt-[22px]")}>
                    <MessageSquarePlus size={16} />
                    New chat
                  </button>
                </div>
                {sessions.length > 0 && (
                  <div className="w-full border-t border-border-subtle pt-2">
                    <div className="mb-2.5 text-center text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      Recent
                    </div>
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {sessions.slice(0, 5).map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-left text-[0.8125rem] transition-colors duration-150 hover:border-border hover:bg-muted"
                            onClick={() => loadSession(s.id)}
                          >
                            <span className="min-w-0 truncate whitespace-nowrap font-medium text-foreground">{s.preview || "Chat"}</span>
                            <span className="shrink-0 text-[0.75rem] text-muted-foreground">{new Date(s.updatedAt).toLocaleDateString()}</span>
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
