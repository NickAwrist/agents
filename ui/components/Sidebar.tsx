import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, Loader2, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import type { SessionSummary } from "../types";

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
    <div className="sidebar-panel">
      <div className="sidebar-panel__header">
        <div className="sidebar-brand">
          {!collapsed && (
            <div className="sidebar-brand__copy">
              <span className="sidebar-brand__label">Chats</span>
              <span className="sidebar-brand__title">Recent</span>
            </div>
          )}
        </div>
        <button type="button" className="icon-button sidebar-panel__collapse" onClick={onToggleCollapsed} aria-label="Toggle sidebar width">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="sidebar-panel__body">
        <button type="button" onClick={onNewSession} disabled={isLoading} className="sidebar-new-session">
          {isLoading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
          {!collapsed && <span>New chat</span>}
        </button>

        {!collapsed && (
          <div className="sidebar-meta">
            <span>{sessions.length} saved</span>
          </div>
        )}

        <div className="sidebar-list">
          {sessions.map((session) => {
            const active = session.id === activeSessionId;
            if (collapsed) {
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelectSession(session.id)}
                  className={["session-card", active ? "session-card--active" : "", "session-card--collapsed"].filter(Boolean).join(" ")}
                  title={session.preview || "Chat"}
                >
                  <div className="session-card__body">
                    <div className="session-card__collapsed-dot" />
                  </div>
                </button>
              );
            }
            return (
              <div key={session.id} className={["session-row", active ? "session-row--active" : ""].filter(Boolean).join(" ")}>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpenId(null);
                    onSelectSession(session.id);
                  }}
                  className={["session-card", active ? "session-card--active" : ""].filter(Boolean).join(" ")}
                >
                  <div className="session-card__body">
                    <div className="session-card__preview">{session.preview || "New chat"}</div>
                    <div className="session-card__meta">
                      <Clock3 size={12} />
                      <span>{new Date(session.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </button>
                <div className="session-row__menu" ref={menuOpenId === session.id ? menuWrapRef : undefined}>
                  <button
                    type="button"
                    className="session-row__menu-trigger"
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
                    <div className="session-menu" role="menu">
                      <button
                        type="button"
                        className="session-menu__item"
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
                        className="session-menu__item session-menu__item--danger"
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
            <div className="sidebar-empty">
              {!collapsed ? "No chats yet. Start one from the button above." : "Empty"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
