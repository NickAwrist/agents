import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { TruncateConfirmModal } from "./components/TruncateConfirmModal";
import { Bug, MessageSquarePlus, PanelLeft, Sparkles, X } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";
import { StepsModal } from "./components/StepsModal";
import { DebugModal } from "./components/DebugModal";
import { RenameSessionModal } from "./components/RenameSessionModal";
import type { SessionSummary, Message, MessageStep, DebugData } from "./types";
import { cx, iconButton, primaryButton } from "./styles";
import { loadChatsV1, removeStoredSession, upsertStoredSession } from "./persist/chats";
import { storedSessionToSummary } from "./persist/preview";

function readSseBlocks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onData: (obj: Record<string, unknown>) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  return (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const idx = buffer.indexOf("\n\n");
        if (idx < 0) break;
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        try {
          onData(JSON.parse(dataLine.slice(6)) as Record<string, unknown>);
        } catch {
          /* ignore */
        }
      }
    }
  })();
}

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
  const [editingUserIndex, setEditingUserIndex] = useState<number | null>(null);
  const [truncateConfirm, setTruncateConfirm] = useState<
    { kind: "edit"; userIndex: number; text: string } | { kind: "retry"; userIndex: number } | null
  >(null);
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(null);
  const [chatPending, setChatPending] = useState(false);
  const debugOpenRef = useRef(false);
  debugOpenRef.current = debugOpen;

  const refreshSessions = useCallback(() => {
    const list = loadChatsV1()
      .map(storedSessionToSummary)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    setSessions(list);
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const createSession = () => {
    setIsLoading(true);
    try {
      const id = crypto.randomUUID();
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
  };

  const loadSession = (id: string) => {
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
  };

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  const fetchDebugData = async (id: string) => {
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
  };

  const runChatTurn = async (
    priorMessages: Message[],
    messageText: string,
    options: { rebuildModelMessages: boolean },
  ) => {
    if (!messageText.trim() || !activeSessionId) return;

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
            if (debugOpenRef.current) fetchDebugData(activeSessionId!);
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
  };

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !activeSessionId) return;
    const msg = input.trim();
    setInput("");
    await runChatTurn(messages, msg, { rebuildModelMessages: false });
  };

  const confirmTruncateAndRetry = async () => {
    const p = truncateConfirm;
    setTruncateConfirm(null);
    setEditingUserIndex(null);
    if (!p || !activeSessionId) return;
    const row = messages[p.userIndex];
    if (!row || row.role !== "user") return;
    const text = p.kind === "edit" ? p.text : row.content;
    if (!text.trim()) return;
    await runChatTurn(messages.slice(0, p.userIndex), text, { rebuildModelMessages: true });
  };

  const toggleDebug = () => {
    if (!debugOpen && activeSessionId) fetchDebugData(activeSessionId);
    setDebugOpen(!debugOpen);
  };

  const requestDeleteSession = (id: string) => {
    setPendingDeleteSessionId(id);
  };

  const performDeleteSession = () => {
    const id = pendingDeleteSessionId;
    setPendingDeleteSessionId(null);
    if (!id) return;
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
  };

  const saveSessionTitle = (title: string) => {
    if (!renameSessionId) return;
    const id = renameSessionId;
    upsertStoredSession({
      id,
      customTitle: title.trim().length > 0 ? title.trim() : null,
      updatedAt: Date.now(),
    });
    setRenameSessionId(null);
    refreshSessions();
  };

  const modalSteps = stepsModalData === "live" ? streamingSteps : stepsModalData;
  const renameTarget = renameSessionId ? sessions.find((s) => s.id === renameSessionId) : null;

  const sidebarCols = sidebarCollapsed ? "72px minmax(0, 1fr)" : "260px minmax(0, 1fr)";

  return (
    <div className="h-screen overflow-hidden">
      <div
        className="grid h-full max-[900px]:grid-cols-1 min-[901px]:overflow-hidden min-[901px]:transition-[grid-template-columns] min-[901px]:duration-300 min-[901px]:ease-[cubic-bezier(0.22,1,0.36,1)] min-[901px]:[grid-template-columns:var(--app-sidebar-cols)]"
        style={{ ["--app-sidebar-cols" as string]: sidebarCols } as CSSProperties}
      >
        <aside
          id="app-sidebar"
          className={cx(
            "min-h-0 min-w-0 border-r border-border-subtle bg-background min-[901px]:w-full",
            "max-[900px]:fixed max-[900px]:top-0 max-[900px]:bottom-0 max-[900px]:left-0 max-[900px]:z-30 max-[900px]:w-[min(85vw,300px)] max-[900px]:shadow-[4px_0_24px_rgba(0,0,0,0.35)]",
            "max-[900px]:transform-gpu max-[900px]:transition-transform max-[900px]:duration-300 max-[900px]:ease-[cubic-bezier(0.22,1,0.36,1)]",
            sidebarOpen ? "max-[900px]:translate-x-0" : "max-[900px]:-translate-x-full",
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
            onDeleteSession={requestDeleteSession}
            isLoading={isLoading}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
          />
        </aside>

        <button
          type="button"
          aria-hidden={!sidebarOpen}
          tabIndex={sidebarOpen ? 0 : -1}
          className={cx(
            "fixed inset-0 z-20 border-0 bg-black/45 transition-opacity duration-300 ease-out max-[900px]:block min-[901px]:hidden",
            sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        />

        <main className="relative min-h-0 min-w-0 bg-background">
          <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2.5 max-[640px]:left-3.5 max-[640px]:top-3.5 min-[901px]:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className={cx(iconButton, "pointer-events-auto")}
              title="Open chats"
              aria-expanded={sidebarOpen}
              aria-controls="app-sidebar"
            >
              <PanelLeft size={18} />
            </button>
          </div>
          <div className="pointer-events-none absolute right-4 top-4 z-10 flex items-center gap-2.5 max-[640px]:right-3.5 max-[640px]:top-3.5">
            {activeSessionId && (
              <button
                type="button"
                onClick={toggleDebug}
                className={cx(iconButton, "pointer-events-auto")}
                title="Debug"
                aria-pressed={debugOpen}
              >
                {debugOpen ? <X size={18} /> : <Bug size={18} />}
              </button>
            )}
          </div>

          <section className="flex h-full min-h-0 overflow-hidden pt-14 max-[640px]:pt-[52px]">
            {activeSessionId ? (
              <div key={activeSessionId} className="ui-animate-fade-in flex h-full min-h-0 min-w-0 flex-1 flex-col">
                <ChatArea
                  messages={messages}
                  streamingSteps={streamingSteps}
                  streamingStep={streamingStep}
                  chatPending={chatPending}
                  input={input}
                  setInput={setInput}
                  onSendMessage={sendMessage}
                  onViewSteps={setStepsModalData}
                  editingUserIndex={editingUserIndex}
                  onStartEditUser={setEditingUserIndex}
                  onCancelEditUser={() => setEditingUserIndex(null)}
                  onRequestEditConfirm={(userIndex, text) => setTruncateConfirm({ kind: "edit", userIndex, text })}
                  onRequestRetryConfirm={(userIndex) => setTruncateConfirm({ kind: "retry", userIndex })}
                />
              </div>
            ) : (
              <div
                key="home"
                className="ui-animate-fade-in mx-auto flex h-full w-full max-w-[28rem] flex-col items-center justify-center gap-8 px-6 pb-12 pt-8"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="mb-5 flex size-[52px] items-center justify-center rounded-[14px] bg-accent-soft text-accent" aria-hidden>
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
                            className="flex w-full items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface px-3 py-2.5 text-left text-[0.8125rem] transition-[color,background-color,border-color,transform] duration-150 ease-out hover:border-border hover:bg-muted active:scale-[0.99] active:bg-muted/80"
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
      {truncateConfirm && (
        <TruncateConfirmModal
          title="Delete later messages?"
          description="All message history after this point will be permanently deleted. This cannot be undone."
          onClose={() => setTruncateConfirm(null)}
          onConfirm={confirmTruncateAndRetry}
        />
      )}
      {pendingDeleteSessionId && (
        <TruncateConfirmModal
          title="Delete this chat?"
          description="This chat and all of its messages will be permanently deleted. This cannot be undone."
          confirmLabel="Delete"
          onClose={() => setPendingDeleteSessionId(null)}
          onConfirm={performDeleteSession}
        />
      )}
    </div>
  );
}
