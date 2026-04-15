import { useState, useRef, useEffect, useCallback } from "react";
import { Bug, Check, Copy, EyeOff, Folder, FolderOpen, PanelLeft, X } from "lucide-react";
import { ModelSelectBar } from "./ModelSelectBar";
import { AgentSelectBar } from "./AgentSelectBar";
import { cx, iconButton } from "../styles";
import type { OllamaModelOption } from "../types";

type ChatAppHeaderProps = {
  activeSessionId: string | null;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  ollamaModels: OllamaModelOption[];
  modelsLoadError: string | null;
  selectedModel: string;
  onModelChange: (model: string) => void;
  chatAgents: { name: string }[];
  selectedSessionAgent: string;
  onSessionAgentChange: (name: string) => void;
  headerChatBusy: boolean;
  debugOpen: boolean;
  onToggleDebug: () => void;
  onCopyEntireChat?: () => Promise<boolean>;
  isEphemeral?: boolean;
  sessionDirectory?: string;
  onSessionDirectoryDraft?: (value: string) => void;
  onSessionDirectoryPersist?: () => void | Promise<void>;
};

/* ------------------------------------------------------------------ */
/*  Folder picker popover                                             */
/* ------------------------------------------------------------------ */

function FolderPickerButton({
  sessionDirectory = "",
  onSessionDirectoryDraft,
  onSessionDirectoryPersist,
  disabled,
}: {
  sessionDirectory?: string;
  onSessionDirectoryDraft: (value: string) => void;
  onSessionDirectoryPersist: () => void | Promise<void>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pickingFolder, setPickingFolder] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const dirTrimmed = sessionDirectory.trim();
  const hasDir = dirTrimmed.length > 0;
  const normalizedPath = dirTrimmed.replace(/\\/g, "/");
  const folderBasename =
    normalizedPath.length > 0
      ? (normalizedPath.split("/").filter(Boolean).pop() ?? dirTrimmed)
      : "";

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);

  const pickFolder = async () => {
    setPickingFolder(true);
    try {
      const res = await fetch("/api/sessions/pick-directory", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { path?: string | null; error?: string };
      if (!res.ok) { window.alert(typeof data.error === "string" ? data.error : res.statusText); return; }
      if (typeof data.path === "string" && data.path.trim().length > 0) {
        onSessionDirectoryDraft(data.path.trim());
        await onSessionDirectoryPersist();
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not pick folder");
    } finally {
      setPickingFolder(false);
    }
  };

  const clearFolder = async () => {
    onSessionDirectoryDraft("");
    await onSessionDirectoryPersist();
    close();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled || pickingFolder}
        onClick={() => hasDir ? setOpen((v) => !v) : void pickFolder()}
        title={hasDir ? folderBasename : "Set working directory"}
        aria-label={hasDir ? `Working directory: ${folderBasename}` : "Set working directory"}
        className={cx(
          "relative inline-flex items-center gap-1.5 rounded-lg border bg-transparent px-2 py-1.5 text-[0.75rem] font-medium transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.97]",
          hasDir
            ? "border-border-subtle text-foreground hover:border-border hover:bg-muted"
            : "border-transparent text-muted-foreground/70 hover:border-border-subtle hover:bg-muted/50 hover:text-muted-foreground",
          (disabled || pickingFolder) && "pointer-events-none opacity-50",
        )}
      >
        {hasDir ? <Folder size={14} /> : <FolderOpen size={14} />}
        {hasDir && (
          <span className="max-w-[5rem] truncate sm:max-w-[7rem]">
            {pickingFolder ? "…" : folderBasename}
          </span>
        )}
      </button>

      {open && hasDir && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right animate-[popover-in_120ms_ease-out] rounded-xl border border-border-subtle bg-surface p-3 shadow-xl shadow-black/30">
          <p className="mb-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground/70">
            Working directory
          </p>
          <p className="break-all text-[0.8rem] leading-snug text-foreground/90" title={dirTrimmed}>
            {dirTrimmed}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pickingFolder}
              onClick={() => void pickFolder()}
              className="flex-1 rounded-lg border border-border-subtle bg-transparent px-2 py-1.5 text-[0.75rem] font-medium text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-muted hover:text-foreground"
            >
              Change
            </button>
            <button
              type="button"
              disabled={pickingFolder}
              onClick={() => void clearFolder()}
              className="flex-1 rounded-lg border border-border-subtle bg-transparent px-2 py-1.5 text-[0.75rem] font-medium text-muted-foreground transition-colors duration-150 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Header                                                            */
/* ------------------------------------------------------------------ */

export function ChatAppHeader({
  activeSessionId,
  sidebarOpen,
  onOpenSidebar,
  ollamaModels,
  modelsLoadError,
  selectedModel,
  onModelChange,
  chatAgents,
  selectedSessionAgent,
  onSessionAgentChange,
  headerChatBusy,
  debugOpen,
  onToggleDebug,
  onCopyEntireChat,
  isEphemeral,
  sessionDirectory = "",
  onSessionDirectoryDraft,
  onSessionDirectoryPersist,
}: ChatAppHeaderProps) {
  const [chatCopied, setChatCopied] = useState(false);

  const handleCopyChat = async () => {
    if (!onCopyEntireChat) return;
    const ok = await onCopyEntireChat();
    if (ok) {
      setChatCopied(true);
      window.setTimeout(() => setChatCopied(false), 1500);
    }
  };

  return (
    <div
      className={cx(
        "pointer-events-none absolute inset-x-0 top-0 z-10 flex h-14 items-center justify-between gap-3 px-4 max-[640px]:h-[52px] max-[640px]:px-3.5",
        activeSessionId &&
          "border-b border-border-subtle/60 bg-background/[0.16] shadow-[0_1px_0_0_rgba(255,255,255,0.03)] backdrop-blur-xl backdrop-saturate-125",
      )}
    >
      <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={onOpenSidebar}
          className={cx(iconButton, "shrink-0 min-[901px]:hidden")}
          title="Open chats"
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
        >
          <PanelLeft size={18} />
        </button>
        {activeSessionId && (
          <div className="flex min-w-0 items-center gap-1.5">
            {isEphemeral && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-amber-400">
                <EyeOff size={12} />
                Ephemeral
              </span>
            )}
            <ModelSelectBar
              ollamaModels={ollamaModels}
              modelsLoadError={modelsLoadError}
              selectedModel={selectedModel}
              onModelChange={onModelChange}
              disabled={headerChatBusy}
            />
            <AgentSelectBar
              agents={chatAgents}
              selectedAgent={selectedSessionAgent}
              onAgentChange={onSessionAgentChange}
              disabled={headerChatBusy}
            />
          </div>
        )}
      </div>
      <div className="pointer-events-auto flex shrink-0 items-center gap-1">
        {activeSessionId && onSessionDirectoryDraft && onSessionDirectoryPersist && (
          <FolderPickerButton
            sessionDirectory={sessionDirectory}
            onSessionDirectoryDraft={onSessionDirectoryDraft}
            onSessionDirectoryPersist={onSessionDirectoryPersist}
            disabled={headerChatBusy}
          />
        )}
        {activeSessionId && onCopyEntireChat && (
          <button
            type="button"
            onClick={() => void handleCopyChat()}
            className={cx(iconButton)}
            title={chatCopied ? "Copied" : "Copy entire chat"}
            aria-label={chatCopied ? "Copied" : "Copy entire chat"}
          >
            {chatCopied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        )}
        {activeSessionId && (
          <button
            type="button"
            onClick={onToggleDebug}
            className={cx(iconButton)}
            title="Debug"
            aria-pressed={debugOpen}
          >
            {debugOpen ? <X size={18} /> : <Bug size={18} />}
          </button>
        )}
      </div>
    </div>
  );
}
