import { ArrowLeft, Save } from "lucide-react";
import { cx, primaryButton } from "../../styles";
import type { SettingsPageProps } from "./types";
import type { SettingsTab } from "./types";
import { GeneralSettingsTab } from "./GeneralSettingsTab";
import { ImageGenerationTab } from "./ImageGenerationTab";
import { useSettingsPageState } from "./useSettingsPageState";

export function SettingsPage(props: SettingsPageProps) {
  const p = useSettingsPageState(props);

  const tabButtonClass = (t: SettingsTab) =>
    cx(
      "rounded-t-md border-b-2 px-4 py-2 text-[0.8125rem] font-medium transition-colors",
      p.tab === t
        ? "border-foreground text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-background px-5 py-3">
        <button
          type="button"
          onClick={props.onBack}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Back to chat
        </button>
        <div className="h-4 w-px bg-border-subtle" />
        <h1 className="text-[0.9375rem] font-semibold text-foreground">Settings</h1>
      </header>

      <div className="flex shrink-0 gap-1 border-b border-border-subtle px-5">
        <button type="button" className={tabButtonClass("general")} onClick={() => p.setTab("general")}>
          General
        </button>
        <button
          type="button"
          className={tabButtonClass("image-generation")}
          onClick={() => p.setTab("image-generation")}
        >
          Image Generation
        </button>
      </div>

      <main className="flex-1 overflow-y-auto p-6">
        <form onSubmit={p.handleSubmit} className="mx-auto max-w-2xl space-y-6">
          {p.error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">{p.error}</div>
          )}

          {p.tab === "general" && (
            <GeneralSettingsTab
              settings={p.settings}
              onFieldChange={p.handleChange}
              ollamaUri={p.ollamaUri}
              onOllamaUriInput={p.onOllamaUriInput}
              ollamaConnected={props.ollamaConnected}
              testState={p.testState}
              onTestOllama={p.handleTestOllama}
              availableModels={p.availableModels}
            />
          )}

          {p.tab === "image-generation" && (
            <ImageGenerationTab
              comfyuiConnected={props.comfyuiConnected}
              comfyUri={p.comfyUri}
              onComfyUriInput={p.onComfyUriInput}
              comfyTestState={p.comfyTestState}
              onTestComfyUI={p.handleTestComfyUI}
              comfyModel={p.comfyModel}
              setComfyModel={p.setComfyModel}
              comfyModels={p.comfyModels}
              comfySize={p.comfySize}
              setComfySize={p.setComfySize}
              comfyNegative={p.comfyNegative}
              setComfyNegative={p.setComfyNegative}
            />
          )}

          <div className="flex justify-end border-t border-border-subtle pt-6">
            <button
              type="submit"
              disabled={!p.isDirty || p.isSaving}
              aria-busy={p.isSaving}
              className={cx(primaryButton, (!p.isDirty || p.isSaving) && "opacity-60")}
            >
              <Save size={15} />
              Save settings
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
