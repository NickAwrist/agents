import { useState } from "react";
import { Bug, Check, Copy, EyeOff, PanelLeft, X } from "lucide-react";
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
  /** Copy full transcript (USER/MODEL blocks); return whether clipboard write succeeded. */
  onCopyEntireChat?: () => Promise<boolean>;
  isEphemeral?: boolean;
};

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
