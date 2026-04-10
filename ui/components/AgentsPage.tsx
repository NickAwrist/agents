import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Save, Trash2, Bot, Wrench, ArrowLeft, MoreVertical } from "lucide-react";
import { cx, primaryButton, secondaryButton, eyebrowText } from "../styles";
import { TruncateConfirmModal } from "./TruncateConfirmModal";
import {
  fetchAgents,
  fetchBuiltinTools,
  fetchDefaultChatAgent,
  putDefaultChatAgentApi,
  createAgentApi,
  updateAgentApi,
  deleteAgentApi,
  type AgentData,
} from "../persist/agents";

type EditorState = {
  name: string;
  description: string;
  system_prompt: string;
  tools: string[];
};

function emptyEditor(): EditorState {
  return { name: "", description: "", system_prompt: "", tools: [] };
}

function editorFromAgent(a: AgentData): EditorState {
  return {
    name: a.name,
    description: a.description,
    system_prompt: a.system_prompt,
    tools: [...a.tools],
  };
}

const PROTECTED_AGENT_NAME = "general_agent";

function canDeleteAgent(a: AgentData): boolean {
  return a.name !== PROTECTED_AGENT_NAME;
}

export function AgentsPage({ onBack }: { onBack: () => void }) {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [builtinTools, setBuiltinTools] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultDraft, setDefaultDraft] = useState("general_agent");
  const [defaultSaving, setDefaultSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [agentList, tools, def] = await Promise.all([
      fetchAgents(),
      fetchBuiltinTools(),
      fetchDefaultChatAgent(),
    ]);
    setAgents(agentList);
    setBuiltinTools(tools);
    setDefaultDraft(def);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!menuOpenId) return;
    const onDoc = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return;
      if (menuWrapRef.current?.contains(e.target)) return;
      setMenuOpenId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpenId]);

  const otherAgentNames = agents
    .filter((a) => a.id !== selectedId)
    .map((a) => a.name);

  const selectAgent = (a: AgentData) => {
    setSelectedId(a.id);
    setIsNew(false);
    setEditor(editorFromAgent(a));
    setError(null);
  };

  const startNew = () => {
    setSelectedId(null);
    setIsNew(true);
    setEditor(emptyEditor());
    setError(null);
  };

  const toggleTool = (tool: string) => {
    setEditor((prev) => ({
      ...prev,
      tools: prev.tools.includes(tool)
        ? prev.tools.filter((t) => t !== tool)
        : [...prev.tools, tool],
    }));
  };

  const handleSave = async () => {
    setError(null);
    if (!editor.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await createAgentApi(editor);
        await load();
        setSelectedId(created.id);
        setIsNew(false);
        setEditor(editorFromAgent(created));
      } else if (selectedId) {
        await updateAgentApi(selectedId, editor);
        await load();
      }
    } catch (e: any) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setMenuOpenId(null);
    setDeleting(true);
    setError(null);
    try {
      await deleteAgentApi(id);
      setPendingDelete(null);
      if (selectedId === id) {
        setSelectedId(null);
        setIsNew(false);
        setEditor(emptyEditor());
      }
      await load();
    } catch (e: any) {
      setError(e.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const requestDeleteAgent = (a: AgentData) => {
    if (!canDeleteAgent(a)) return;
    setError(null);
    setPendingDelete({ id: a.id, name: a.name });
  };

  const persistDefaultAgent = async (name: string, previous: string) => {
    try {
      const next = await putDefaultChatAgentApi(name);
      setDefaultDraft(next);
    } catch (err: any) {
      setDefaultDraft(previous);
      setError(err.message || "Failed to save default");
    } finally {
      setDefaultSaving(false);
    }
  };

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;
  const showEditor = isNew || selectedId;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-5 py-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ArrowLeft size={15} />
          Back to chat
        </button>
        <div className="h-4 w-px bg-border-subtle" />
        <h1 className="text-[0.9375rem] font-semibold text-foreground">Manage Agents</h1>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border-subtle bg-muted/20 px-5 py-3">
        <label className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
          <span className="text-foreground">Default agent</span>
          <select
            value={defaultDraft}
            disabled={defaultSaving || agents.length === 0}
            onChange={(e) => {
              const name = e.target.value;
              const previous = defaultDraft;
              setDefaultDraft(name);
              setDefaultSaving(true);
              setError(null);
              void persistDefaultAgent(name, previous);
            }}
            className="cursor-pointer rounded-lg border border-border-subtle bg-background px-2.5 py-1.5 text-[0.8125rem] text-foreground outline-none focus:border-border disabled:cursor-not-allowed disabled:opacity-50"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-400/20 bg-red-400/5 px-5 py-2.5 text-[0.8125rem] text-red-400">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] max-[700px]:grid-cols-1">
        {/* Left: agent list */}
        <div className="flex min-h-0 flex-col border-r border-border-subtle max-[700px]:border-b max-[700px]:border-r-0">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <span className={eyebrowText}>Agents</span>
            <button type="button" onClick={startNew} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.75rem] font-medium text-accent transition-colors hover:bg-muted">
              <Plus size={14} />
              New
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {agents.map((a) => {
              const deletable = canDeleteAgent(a);
              const active = selectedId === a.id && !isNew;
              return (
                <div
                  key={a.id}
                  className={cx(
                    "group mb-0.5 grid items-stretch rounded-lg transition-colors duration-150",
                    deletable ? "grid-cols-[minmax(0,1fr)_32px]" : "grid-cols-1",
                    active ? "bg-muted/50" : "hover:bg-muted/30",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpenId(null);
                      selectAgent(a);
                    }}
                    className={cx(
                      "flex min-w-0 items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-150",
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Bot size={15} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.8125rem] font-medium">{a.name}</div>
                      <div className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">{a.description || "No description"}</div>
                    </div>
                  </button>
                  {deletable && (
                    <div
                      className="relative flex items-start justify-center pr-0.5 pt-2 max-[700px]:opacity-100 md:opacity-0 md:transition-opacity md:duration-150 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                      ref={menuOpenId === a.id ? menuWrapRef : undefined}
                    >
                      <button
                        type="button"
                        className={cx(
                          "inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-transparent text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.94] active:bg-muted/70 max-[700px]:opacity-100",
                          menuOpenId === a.id && "bg-muted text-foreground md:opacity-100",
                        )}
                        aria-expanded={menuOpenId === a.id}
                        aria-haspopup="menu"
                        aria-label="Agent options"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId((v) => (v === a.id ? null : a.id));
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {menuOpenId === a.id && (
                        <div
                          className="ui-animate-slide-up absolute right-0 top-full z-50 mt-1 min-w-[140px] origin-top-right rounded-lg border border-border-subtle bg-surface p-1 shadow-[0_10px_28px_rgba(0,0,0,0.4)]"
                          role="menu"
                        >
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.8125rem] text-red-400 transition-[color,background-color,transform] duration-150 ease-out hover:bg-red-400/10 hover:text-red-300 active:scale-[0.99] active:bg-red-400/15"
                            role="menuitem"
                            disabled={deleting}
                            onClick={() => {
                              setMenuOpenId(null);
                              requestDeleteAgent(a);
                            }}
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: editor */}
        <div className="min-h-0 overflow-y-auto">
          {showEditor ? (
            <div className="ui-animate-fade-in mx-auto max-w-2xl px-6 py-6">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-[1.125rem] font-semibold text-foreground">
                  {isNew ? "New Agent" : `Edit: ${selectedAgent?.name ?? ""}`}
                </h2>
                {selectedAgent && canDeleteAgent(selectedAgent) && (
                  <button
                    type="button"
                    onClick={() => requestDeleteAgent(selectedAgent)}
                    disabled={deleting}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[0.75rem] text-red-400 transition-colors hover:bg-red-400/10 hover:text-red-300 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-5">
                {/* Name */}
                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.75rem] font-medium text-muted-foreground">Name</span>
                  <input
                    type="text"
                    value={editor.name}
                    onChange={(e) => setEditor((p) => ({ ...p, name: e.target.value }))}
                    placeholder="my_agent"
                    className="rounded-lg border border-border-subtle bg-background px-3 py-2 text-[0.8125rem] text-foreground outline-none transition-colors focus:border-border placeholder:text-muted-foreground/50"
                  />
                </label>

                {/* Description */}
                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.75rem] font-medium text-muted-foreground">Description</span>
                  <textarea
                    value={editor.description}
                    onChange={(e) => setEditor((p) => ({ ...p, description: e.target.value }))}
                    placeholder="What this agent does..."
                    rows={2}
                    className="rounded-lg border border-border-subtle bg-background px-3 py-2 text-[0.8125rem] text-foreground outline-none transition-colors focus:border-border placeholder:text-muted-foreground/50"
                    style={{ resize: "vertical" }}
                  />
                </label>

                {/* System prompt */}
                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.75rem] font-medium text-muted-foreground">System Prompt</span>
                  <textarea
                    value={editor.system_prompt}
                    onChange={(e) => setEditor((p) => ({ ...p, system_prompt: e.target.value }))}
                    placeholder="Instructions for the agent..."
                    rows={6}
                    className="rounded-lg border border-border-subtle bg-background px-3 py-2.5 text-[0.8125rem] leading-[1.6] text-foreground outline-none transition-colors focus:border-border placeholder:text-muted-foreground/50"
                    style={{ resize: "vertical" }}
                  />
                </label>

                {/* Tools */}
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 flex items-center gap-1.5 text-[0.75rem] font-medium text-muted-foreground">
                    <Wrench size={13} />
                    Tools
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {builtinTools.map((tool) => {
                      const active = editor.tools.includes(tool);
                      return (
                        <button
                          key={tool}
                          type="button"
                          onClick={() => toggleTool(tool)}
                          className={cx(
                            "rounded-md border px-2.5 py-1 text-[0.75rem] font-medium transition-colors duration-150",
                            active
                              ? "border-accent/30 bg-accent-soft-strong text-foreground"
                              : "border-border-subtle bg-transparent text-muted-foreground hover:border-border hover:text-foreground",
                          )}
                        >
                          {tool}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Subagents (other agents as tools) */}
                {otherAgentNames.length > 0 && (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 flex items-center gap-1.5 text-[0.75rem] font-medium text-muted-foreground">
                      <Bot size={13} />
                      Subagents
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {otherAgentNames.map((name) => {
                        const active = editor.tools.includes(name);
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => toggleTool(name)}
                            className={cx(
                              "rounded-md border px-2.5 py-1 text-[0.75rem] font-medium transition-colors duration-150",
                              active
                                ? "border-accent/30 bg-accent-soft-strong text-foreground"
                                : "border-border-subtle bg-transparent text-muted-foreground hover:border-border hover:text-foreground",
                            )}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                )}

                {/* Save */}
                <div className="flex items-center gap-3 pt-2">
                  <button type="button" onClick={handleSave} disabled={saving} className={cx(primaryButton)}>
                    <Save size={15} />
                    {saving ? "Saving..." : "Save"}
                  </button>
                  {!isNew && (
                    <button
                      type="button"
                      onClick={() => { setSelectedId(null); setIsNew(false); setEditor(emptyEditor()); }}
                      className={secondaryButton}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-[0.875rem] text-muted-foreground">Select an agent or create a new one</p>
            </div>
          )}
        </div>
      </div>

      {pendingDelete && (
        <TruncateConfirmModal
          title="Delete this agent?"
          description={`Remove “${pendingDelete.name}” from your agents. Sessions that used it will switch to ${PROTECTED_AGENT_NAME}. This cannot be undone.`}
          confirmLabel="Delete"
          busyConfirmLabel="Deleting…"
          busy={deleting}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => void performDelete()}
        />
      )}
    </div>
  );
}
