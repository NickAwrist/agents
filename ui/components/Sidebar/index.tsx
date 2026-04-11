import { useEffect, useRef, useState } from "react";
import { Bot, ChevronLeft, ChevronRight, EyeOff, Loader2, Plus, Settings } from "lucide-react";
import { cx, eyebrowText, iconButton } from "../../styles";
import { SessionListItem } from "./SessionListItem";
import type { SidebarProps } from "./types";

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onNewEphemeralSession,
  onRenameSession,
  onDeleteSession,
  isLoading,
  collapsed,
  onToggleCollapsed,
  onManageAgents,
  onSettings,
}: SidebarProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] px-2.5 pb-3 pt-3">
      <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          {!collapsed && (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className={eyebrowText}>Chats</span>
              <span className="text-[0.9375rem] font-semibold text-foreground">Recent</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className={cx(iconButton, "max-[900px]:hidden")}
          onClick={onToggleCollapsed}
          aria-label="Toggle sidebar width"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2">
        <div className={cx("flex gap-2", collapsed ? "flex-col" : "flex-row")}>
          <button
            type="button"
            onClick={onNewSession}
            disabled={isLoading}
            className={cx(
              "inline-flex items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface px-2.5 py-2 text-[0.8125rem] font-semibold text-foreground transition-[color,background-color,border-color,transform] duration-150 ease-out hover:border-border hover:bg-muted active:scale-[0.99] active:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
              collapsed ? "w-full" : "flex-1",
            )}
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {!collapsed && <span>New chat</span>}
          </button>
          <button
            type="button"
            onClick={onNewEphemeralSession}
            title="Ephemeral chat — not saved"
            className={cx(
              "inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-[0.8125rem] font-semibold text-amber-400 transition-[color,background-color,border-color,transform] duration-150 ease-out hover:border-amber-500/35 hover:bg-amber-500/10 active:scale-[0.99] active:bg-amber-500/15",
              collapsed ? "w-full shrink-0" : "shrink-0",
            )}
          >
            <EyeOff size={16} />
          </button>
        </div>

        {!collapsed && (
          <div className="px-1.5 text-[0.75rem] text-muted-foreground">
            <span>{sessions.length} saved</span>
          </div>
        )}

        <div className="mt-1 min-h-0 overflow-y-auto border-t border-border-subtle pt-1">
          {sessions.map((session) => (
            <SessionListItem
              key={session.id}
              session={session}
              active={session.id === activeSessionId}
              collapsed={collapsed}
              menuOpenId={menuOpenId}
              setMenuOpenId={setMenuOpenId}
              menuWrapRef={menuWrapRef}
              onSelectSession={onSelectSession}
              onRenameSession={onRenameSession}
              onDeleteSession={onDeleteSession}
            />
          ))}

          {sessions.length === 0 && (
            <div className="mt-1 border-t border-border-subtle px-2.5 py-3 text-[0.8125rem] leading-[1.5] text-muted-foreground">
              {!collapsed ? "No chats yet. Start one from the button above." : "Empty"}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1 border-t border-border-subtle pt-2">
        <button
          type="button"
          onClick={onManageAgents}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <Bot size={15} />
          {!collapsed && <span>Manage Agents</span>}
        </button>
        <button
          type="button"
          onClick={onSettings}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <Settings size={15} />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>
    </div>
  );
}
