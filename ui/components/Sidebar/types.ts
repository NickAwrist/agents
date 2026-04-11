import type { SessionSummary } from "../../types";

export type SidebarProps = {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onNewEphemeralSession: () => void;
  onRenameSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  isLoading: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onManageAgents: () => void;
  onSettings: () => void;
};
