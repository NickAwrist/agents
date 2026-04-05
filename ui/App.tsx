import { useEffect, useState } from "react";
import {
  Bot,
  Bug,
  Menu,
  Plus,
  X,
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";
import { StepsModal } from "./components/StepsModal";
import { DebugModal } from "./components/DebugModal";
import type { SessionSummary, Message, MessageStep, DebugData } from "./types";

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

  const fetchSessions = async () => {
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const createSession = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      const data = await res.json();
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
    setMessages((prev) => [...prev, { role: "user", content: msg }]);

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

  const modalSteps = stepsModalData === "live" ? streamingSteps : stepsModalData;
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;

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
                <div className="workspace-title__eyebrow">Agent Console</div>
                {activeSessionId ? (
                  <div className="workspace-title__row">
                    <h1>Session</h1>
                    <span className="session-chip">
                      <Bot size={14} />
                      {activeSessionId.slice(0, 12)}
                    </span>
                  </div>
                ) : (
                  <div className="workspace-title__row">
                    <h1>Sessions</h1>
                  </div>
                )}
              </div>
            </div>

            <div className="workspace-header__right">
              {activeSessionId && (
                <button onClick={toggleDebug} className="icon-button" title="Open debug inspector">
                  {debugOpen ? <X size={18} /> : <Bug size={18} />}
                </button>
              )}
              <button onClick={createSession} disabled={isLoading} className="primary-button">
                <Plus size={16} />
                New Session
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
              <div className="empty-state">
                <div className="empty-state__panel">
                  <div className="empty-state__eyebrow">Agent Console</div>
                  <h2>No session selected.</h2>
                  <p>Create a fresh run or pick one from history. The workspace stays focused until you actually open a conversation.</p>
                  <div className="empty-state__details">
                    <div className="empty-state__detail">
                      <span className="empty-state__detail-value">{sessions.length}</span>
                      <span className="empty-state__detail-label">saved session{sessions.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="empty-state__detail">
                      <span className="empty-state__detail-value">Debug</span>
                      <span className="empty-state__detail-label">available once a session is open</span>
                    </div>
                  </div>
                  <div className="empty-state__actions">
                    <button onClick={createSession} disabled={isLoading} className="primary-button">
                      <Plus size={16} />
                      New Session
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>

      {debugOpen && <DebugModal data={debugData} onClose={() => setDebugOpen(false)} />}
      {modalSteps && modalSteps.length > 0 && <StepsModal steps={modalSteps} onClose={() => setStepsModalData(null)} />}
    </div>
  );
}
