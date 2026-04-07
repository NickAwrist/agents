import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { SessionSummary } from "../types";

type UseAppKeybindsOptions = {
  blockShortcuts: boolean;
  sessions: SessionSummary[];
  activeSessionId: string | null;
  switchToSession: (id: string) => void;
  createSession: () => void;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  goToHome: () => void;
  headerChatBusy: boolean;
};

export function useAppKeybinds(opts: UseAppKeybindsOptions) {
  const {
    blockShortcuts,
    sessions,
    activeSessionId,
    switchToSession,
    createSession,
    setSidebarOpen,
    setSidebarCollapsed,
    goToHome,
    headerChatBusy,
  } = opts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (blockShortcuts) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key === "Tab") {
        if (sessions.length === 0) return;
        e.preventDefault();
        e.stopPropagation();

        if (activeSessionId == null) {
          switchToSession(e.shiftKey ? sessions[sessions.length - 1]!.id : sessions[0]!.id);
          return;
        }

        const idx = sessions.findIndex((s) => s.id === activeSessionId);
        if (idx === -1) {
          switchToSession(sessions[0]!.id);
          return;
        }

        const delta = e.shiftKey ? 1 : -1;
        let next = idx + delta;
        if (next < 0) next = sessions.length - 1;
        if (next >= sessions.length) next = 0;
        switchToSession(sessions[next]!.id);
        return;
      }

      if (e.repeat) return;

      const k = e.key.toLowerCase();

      if (k === "b") {
        e.preventDefault();
        const mobile = window.matchMedia("(max-width: 900px)").matches;
        if (mobile) setSidebarOpen((o) => !o);
        else setSidebarCollapsed((c) => !c);
        return;
      }

      if (k === "t" && !e.shiftKey) {
        e.preventDefault();
        createSession();
        return;
      }

      if (k === "m" && !e.shiftKey) {
        if (headerChatBusy || !activeSessionId) return;
        e.preventDefault();
        queueMicrotask(() => {
          const el = document.getElementById("chat-model") as HTMLSelectElement | null;
          if (!el || el.disabled) return;
          el.focus();
          try {
            el.showPicker?.();
          } catch {
            /* showPicker may throw or be unavailable */
          }
        });
        return;
      }

      if (k === "h" && e.shiftKey) {
        e.preventDefault();
        goToHome();
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    blockShortcuts,
    sessions,
    activeSessionId,
    switchToSession,
    createSession,
    setSidebarOpen,
    setSidebarCollapsed,
    goToHome,
    headerChatBusy,
  ]);
}
