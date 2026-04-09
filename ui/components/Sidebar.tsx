import { useEffect, useRef, useState } from "react";
import { Bot, ChevronLeft, ChevronRight, Loader2, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import type { SessionSummary } from "../types";
import { cx, eyebrowText, iconButton } from "../styles";

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onRenameSession,
  onDeleteSession,
  isLoading,
  collapsed,
  onToggleCollapsed,
  onManageAgents,
}: {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onRenameSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  isLoading: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onManageAgents: () => void;
}) {
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
        <button
          type="button"
          onClick={onNewSession}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface px-2.5 py-2 text-[0.8125rem] font-semibold text-foreground transition-[color,background-color,border-color,transform] duration-150 ease-out hover:border-border hover:bg-muted active:scale-[0.99] active:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {!collapsed && <span>New chat</span>}
        </button>

        {!collapsed && (
          <div className="px-1.5 text-[0.75rem] text-muted-foreground">
            <span>{sessions.length} saved</span>
          </div>
        )}

        <div className="mt-1 min-h-0 overflow-y-auto border-t border-border-subtle pt-1">
          {sessions.map((session) => {
            const active = session.id === activeSessionId;
            if (collapsed) {
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                  className={cx(
                    "relative flex w-full justify-center rounded-md px-2 py-2 text-left transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.98]",
                    active &&
                      "before:pointer-events-none before:absolute before:left-1 before:top-1/2 before:h-5 before:w-px before:-translate-y-1/2 before:rounded-full before:bg-foreground/45 before:content-['']",
                  )}
                  title={session.preview || "Chat"}
                >
                  <div className="min-w-0">
                    <div
                      className={cx(
                        "size-1.5 rounded-full bg-muted-foreground/55 transition-[background-color,opacity] duration-150",
                        active && "bg-foreground/50",
                      )}
                    />
                  </div>
                </button>
              );
            }
            return (
              <div key={session.id} className="grid grid-cols-[minmax(0,1fr)_32px] items-stretch border-b border-border-subtle last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpenId(null);
                    onSelectSession(session.id);
                  }}
                  className={cx(
                    "relative block w-full rounded-none rounded-l-md border-l-2 border-transparent bg-transparent px-2 py-2.5 pr-1 text-left transition-[color,background-color,border-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.995]",
                    active && "border-l-foreground/35 bg-muted/20 hover:bg-muted/35",
                  )}
                >
                  <div className="min-w-0">
                    <div className="overflow-hidden text-[0.8125rem] leading-[1.4] text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {session.preview || "New chat"}
                    </div>
                    <div className="mt-1 text-[0.6875rem] text-muted-foreground">
                      {new Date(session.updatedAt).toLocaleString()}
                    </div>
                  </div>
                </button>
                <div className="relative flex items-start justify-center pr-0.5 pt-2" ref={menuOpenId === session.id ? menuWrapRef : undefined}>
                  <button
                    type="button"
                    className={cx(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-transparent text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.94] active:bg-muted/70",
                      menuOpenId === session.id && "bg-muted text-foreground",
                    )}
                    aria-expanded={menuOpenId === session.id}
                    aria-haspopup="menu"
                    aria-label="Chat options"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId((v) => (v === session.id ? null : session.id));
                    }}
                  >
                    <MoreVertical size={16} />
                  </button>
                  {menuOpenId === session.id && (
                    <div
                      className="ui-animate-slide-up absolute right-0 top-full z-50 mt-1 min-w-[140px] origin-top-right rounded-lg border border-border-subtle bg-surface p-1 shadow-[0_10px_28px_rgba(0,0,0,0.4)]"
                      role="menu"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.8125rem] text-foreground transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.99] active:bg-muted/80"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpenId(null);
                          onRenameSession(session.id);
                        }}
                      >
                        <Pencil size={14} />
                        Rename
                      </button>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.8125rem] text-red-400 transition-[color,background-color,transform] duration-150 ease-out hover:bg-red-400/10 hover:text-red-300 active:scale-[0.99] active:bg-red-400/15"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpenId(null);
                          onDeleteSession(session.id);
                        }}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {sessions.length === 0 && (
            <div className="mt-1 border-t border-border-subtle px-2.5 py-3 text-[0.8125rem] leading-[1.5] text-muted-foreground">
              {!collapsed ? "No chats yet. Start one from the button above." : "Empty"}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border-subtle pt-2">
        <button
          type="button"
          onClick={onManageAgents}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-2.5 py-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <Bot size={15} />
          {!collapsed && <span>Manage Agents</span>}
        </button>
      </div>
    </div>
  );
}
