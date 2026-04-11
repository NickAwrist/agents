import { ArrowLeft } from "lucide-react";
import { TruncateConfirmModal } from "../TruncateConfirmModal";
import { emptyEditor, PROTECTED_AGENT_NAME } from "./agentsPageUtils";
import { AgentEditor } from "./AgentEditor";
import { AgentList } from "./AgentList";
import { useAgentsPage } from "./useAgentsPage";

export function AgentsPage({ onBack }: { onBack: () => void }) {
  const p = useAgentsPage();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-5 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
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
            value={p.defaultDraft}
            disabled={p.defaultSaving || p.agents.length === 0}
            onChange={(e) => p.handleDefaultAgentChange(e.target.value)}
            className="cursor-pointer rounded-lg border border-border-subtle bg-background px-2.5 py-1.5 text-[0.8125rem] text-foreground outline-none focus:border-border disabled:cursor-not-allowed disabled:opacity-50"
          >
            {p.agents.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {p.error && (
        <div className="shrink-0 border-b border-red-400/20 bg-red-400/5 px-5 py-2.5 text-[0.8125rem] text-red-400">
          {p.error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] max-[700px]:grid-cols-1">
        <AgentList
          agents={p.agents}
          selectedId={p.selectedId}
          isNew={p.isNew}
          menuOpenId={p.menuOpenId}
          setMenuOpenId={p.setMenuOpenId}
          menuWrapRef={p.menuWrapRef}
          deleting={p.deleting}
          onSelectAgent={p.selectAgent}
          onStartNew={p.startNew}
          onRequestDeleteAgent={p.requestDeleteAgent}
        />

        <div className="min-h-0 overflow-y-auto">
          {p.showEditor ? (
            <AgentEditor
              isNew={p.isNew}
              selectedAgent={p.selectedAgent}
              editor={p.editor}
              setEditor={p.setEditor}
              builtinTools={p.builtinTools}
              otherAgentNames={p.otherAgentNames}
              saving={p.saving}
              deleting={p.deleting}
              onSave={() => void p.handleSave()}
              onCancelEdit={() => {
                p.setSelectedId(null);
                p.setIsNew(false);
                p.setEditor(emptyEditor());
              }}
              onToggleTool={p.toggleTool}
              onRequestDeleteAgent={p.requestDeleteAgent}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-[0.875rem] text-muted-foreground">Select an agent or create a new one</p>
            </div>
          )}
        </div>
      </div>

      {p.pendingDelete && (
        <TruncateConfirmModal
          title="Delete this agent?"
          description={`Remove “${p.pendingDelete.name}” from your agents. Sessions that used it will switch to ${PROTECTED_AGENT_NAME}. This cannot be undone.`}
          confirmLabel="Delete"
          busyConfirmLabel="Deleting…"
          busy={p.deleting}
          onClose={() => p.setPendingDelete(null)}
          onConfirm={() => void p.performDelete()}
        />
      )}
    </div>
  );
}
