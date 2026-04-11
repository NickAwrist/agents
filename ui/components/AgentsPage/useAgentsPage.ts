import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAgents,
  fetchBuiltinTools,
  fetchDefaultChatAgent,
  putDefaultChatAgentApi,
  createAgentApi,
  updateAgentApi,
  deleteAgentApi,
  type AgentData,
} from "../../persist/agents";
import type { AgentEditorState } from "./types";
import { canDeleteAgent, editorFromAgent, editorsEqual, emptyEditor } from "./agentsPageUtils";

export function useAgentsPage() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [builtinTools, setBuiltinTools] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editor, setEditor] = useState<AgentEditorState>(emptyEditor());
  const [baselineEditor, setBaselineEditor] = useState<AgentEditorState>(() => emptyEditor());
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

  const otherAgentNames = agents.filter((a) => a.id !== selectedId).map((a) => a.name);

  const selectAgent = (a: AgentData) => {
    setSelectedId(a.id);
    setIsNew(false);
    const next = editorFromAgent(a);
    setEditor(next);
    setBaselineEditor(next);
    setError(null);
  };

  const startNew = () => {
    setSelectedId(null);
    setIsNew(true);
    const blank = emptyEditor();
    setEditor(blank);
    setBaselineEditor(blank);
    setError(null);
  };

  const toggleTool = (tool: string) => {
    setEditor((prev) => ({
      ...prev,
      tools: prev.tools.includes(tool) ? prev.tools.filter((t) => t !== tool) : [...prev.tools, tool],
    }));
  };

  const handleSave = async () => {
    setError(null);
    if (editorsEqual(editor, baselineEditor)) return;
    if (!editor.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await createAgentApi(editor);
        await load();
        const saved = editorFromAgent(created);
        setSelectedId(created.id);
        setIsNew(false);
        setEditor(saved);
        setBaselineEditor(saved);
      } else if (selectedId) {
        await updateAgentApi(selectedId, editor);
        await load();
        setBaselineEditor({ ...editor, tools: [...editor.tools] });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
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
    } catch (err: unknown) {
      setDefaultDraft(previous);
      setError(err instanceof Error ? err.message : "Failed to save default");
    } finally {
      setDefaultSaving(false);
    }
  };

  const handleDefaultAgentChange = (name: string) => {
    const previous = defaultDraft;
    setDefaultDraft(name);
    setDefaultSaving(true);
    setError(null);
    void persistDefaultAgent(name, previous);
  };

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? null;
  const showEditor = isNew || selectedId;
  const editorDirty = !editorsEqual(editor, baselineEditor);

  return {
    agents,
    builtinTools,
    selectedId,
    setSelectedId,
    isNew,
    setIsNew,
    editor,
    setEditor,
    saving,
    editorDirty,
    error,
    defaultDraft,
    defaultSaving,
    pendingDelete,
    setPendingDelete,
    menuOpenId,
    setMenuOpenId,
    deleting,
    menuWrapRef,
    load,
    otherAgentNames,
    selectAgent,
    startNew,
    toggleTool,
    handleSave,
    performDelete,
    requestDeleteAgent,
    handleDefaultAgentChange,
    selectedAgent,
    showEditor,
  };
}
