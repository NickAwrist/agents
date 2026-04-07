import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { TruncateConfirmModal } from "./components/TruncateConfirmModal";
import { Bug, MessageSquarePlus, PanelLeft, Sparkles, X } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";
import { ModelSelectBar } from "./components/ModelSelectBar";
import { StepsModal } from "./components/StepsModal";
import { DebugModal } from "./components/DebugModal";
import { RenameSessionModal } from "./components/RenameSessionModal";
import type { SessionSummary, Message, MessageStep, DebugData, OllamaModelOption } from "./types";
import { cx, iconButton, primaryButton } from "./styles";
import { loadChatsV1, removeStoredSession, upsertStoredSession } from "./persist/chats";
import { loadPreferredModel, savePreferredModel } from "./persist/modelPreference";
import { storedSessionToSummary } from "./persist/preview";

const OLLAMA_HEALTH_POLL_MS = 3000;

function isStoredSessionEmpty(id: string): boolean {
  const row = loadChatsV1().find((s) => s.id === id);
  return !row?.history?.length;
}

/** randomUUID() is missing on non-secure origins in Firefox; getRandomValues still works. */
function randomSessionId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

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

  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model);
    savePreferredModel(model);
    if (activeSessionId) {
      upsertStoredSession({ id: activeSessionId, model, updatedAt: Date.now() });
    }
  }, [activeSessionId]);

  const refreshSessions = useCallback(() => {
    const list = loadChatsV1()
      .map(storedSessionToSummary)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    setSessions(list);
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

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

  const switchToSession = (id: string) => {
    if (activeSessionId && activeSessionId !== id && isStoredSessionEmpty(activeSessionId)) {
      removeStoredSession(activeSessionId);
      refreshSessions();
    }
    loadSession(id);
  };

  const createSession = () => {
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
    if (!ollamaReady) return;
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
    if (!debugOpen && activeSessionId) {
      void fetchOllamaHealth();
      fetchDebugData(activeSessionId);
    }
    setDebugOpen(!debugOpen);
  };

  const dropSessionFromApp = (id: string) => {
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

  const requestDeleteSession = (id: string) => {
    if (isStoredSessionEmpty(id)) {
      dropSessionFromApp(id);
      return;
    }
    setPendingDeleteSessionId(id);
  };

  const performDeleteSession = () => {
    const id = pendingDeleteSessionId;
    setPendingDeleteSessionId(null);
    if (!id) return;
    dropSessionFromApp(id);
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
  const headerChatBusy = chatPending || streamingStep !== null || streamingSteps.length > 0;

  const sidebarCols = sidebarCollapsed ? "72px minmax(0, 1fr)" : "260px minmax(0, 1fr)";

  return (
    <>
      {ollamaDisconnected && (
        <div
          className="ui-animate-fade-in fixed inset-x-0 top-0 z-[60] flex h-9 items-center justify-center border-b border-red-500/20 bg-red-950/55 px-4 text-center text-[0.75rem] font-medium leading-none text-red-100/95 backdrop-blur-md backdrop-saturate-150 [box-shadow:inset_0_-1px_0_0_rgba(255,255,255,0.04)]"
          role="status"
          aria-live="polite"
        >
          Ollama is disconnected — start Ollama to send messages.
        </div>
      )}
      <div className={cx("h-screen overflow-hidden", ollamaDisconnected && "pt-9")}>
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
              switchToSession(id);
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
          <div
            className={cx(
              "pointer-events-none absolute inset-x-0 top-0 z-10 flex h-14 items-center justify-between gap-3 px-4 max-[640px]:h-[52px] max-[640px]:px-3.5",
              activeSessionId &&
                "border-b border-border-subtle/60 bg-background/[0.12] shadow-[0_1px_0_0_rgba(255,255,255,0.03)] backdrop-blur-lg backdrop-saturate-125",
            )}
          >
            <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className={cx(iconButton, "shrink-0 min-[901px]:hidden")}
                title="Open chats"
                aria-expanded={sidebarOpen}
                aria-controls="app-sidebar"
              >
                <PanelLeft size={18} />
              </button>
              {activeSessionId && (
                <ModelSelectBar
                  ollamaModels={ollamaModels}
                  modelsLoadError={modelsLoadError}
                  selectedModel={selectedModel}
                  onModelChange={handleModelChange}
                  disabled={headerChatBusy}
                />
              )}
            </div>
            <div className="pointer-events-auto flex shrink-0 items-center">
              {activeSessionId && (
                <button
                  type="button"
                  onClick={toggleDebug}
                  className={cx(iconButton)}
                  title="Debug"
                  aria-pressed={debugOpen}
                >
                  {debugOpen ? <X size={18} /> : <Bug size={18} />}
                </button>
              )}
            </div>
          </div>

          <section
            className={cx("flex h-full min-h-0 overflow-hidden", !activeSessionId && "pt-0")}
          >
            {activeSessionId ? (
              <div key={activeSessionId} className="ui-animate-fade-in flex h-full min-h-0 min-w-0 flex-1 flex-col">
                <ChatArea
                  messages={messages}
                  streamingSteps={streamingSteps}
                  streamingStep={streamingStep}
                  chatPending={chatPending}
                  ollamaReady={ollamaReady}
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
                            onClick={() => switchToSession(s.id)}
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

      {debugOpen && (
        <DebugModal data={debugData} ollamaConnected={ollamaConnected} onClose={() => setDebugOpen(false)} />
      )}
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
    </>
  );
}
