import { ChevronLeft, ChevronRight, Clock3, Loader2, Plus } from "lucide-react";
import type { SessionSummary } from "../types";

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  isLoading,
  collapsed,
  onToggleCollapsed,
}: {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  isLoading: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <div className="sidebar-panel">
      <div className="sidebar-panel__header">
        <div className="sidebar-brand">
          {!collapsed && (
            <div className="sidebar-brand__copy">
              <span className="sidebar-brand__label">Sessions</span>
              <span className="sidebar-brand__title">History</span>
            </div>
          )}
        </div>
        <button className="icon-button sidebar-panel__collapse" onClick={onToggleCollapsed} aria-label="Toggle sidebar width">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="sidebar-panel__body">
        <button onClick={onNewSession} disabled={isLoading} className="sidebar-new-session">
          {isLoading ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
          {!collapsed && <span>New</span>}
        </button>

        {!collapsed && (
          <div className="sidebar-meta">
            <span>{sessions.length} sessions</span>
          </div>
        )}

        <div className="sidebar-list">
          {sessions.map((session) => {
            const active = session.id === activeSessionId;
            return (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={["session-card", active ? "session-card--active" : "", collapsed ? "session-card--collapsed" : ""]
                  .filter(Boolean)
                  .join(" ")}
                title={collapsed ? session.preview || "Session" : undefined}
              >
                <div className="session-card__body">
                  {!collapsed && (
                    <>
                      <div className="session-card__preview">{session.preview || "Empty session"}</div>
                      <div className="session-card__meta">
                        <Clock3 size={12} />
                        <span>{new Date(session.updatedAt).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  {collapsed && <div className="session-card__collapsed-dot" />}
                </div>
              </button>
            );
          })}

          {sessions.length === 0 && (
            <div className="sidebar-empty">
              {!collapsed ? "No sessions yet. Create one to start chatting." : "No sessions"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
