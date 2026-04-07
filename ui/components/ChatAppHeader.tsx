import { Bug, PanelLeft, X } from "lucide-react";
import { ModelSelectBar } from "./ModelSelectBar";
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
  headerChatBusy: boolean;
  debugOpen: boolean;
  onToggleDebug: () => void;
};

export function ChatAppHeader({
  activeSessionId,
  sidebarOpen,
  onOpenSidebar,
  ollamaModels,
  modelsLoadError,
  selectedModel,
  onModelChange,
  headerChatBusy,
  debugOpen,
  onToggleDebug,
}: ChatAppHeaderProps) {
  return (
    <div
      className={cx(
        "pointer-events-none absolute inset-x-0 top-0 z-10 flex h-14 items-center justify-between gap-3 px-4 max-[640px]:h-[52px] max-[640px]:px-3.5",
        activeSessionId &&
          "border-b border-border-subtle/60 bg-background/[0.12] shadow-[0_1px_0_0_rgba(255,255,255,0.03)] backdrop-blur-lg backdrop-saturate-125",
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
          <ModelSelectBar
            ollamaModels={ollamaModels}
            modelsLoadError={modelsLoadError}
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            disabled={headerChatBusy}
          />
        )}
      </div>
      <div className="pointer-events-auto flex shrink-0 items-center">
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
