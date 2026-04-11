import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { cx, eyebrowText, primaryButton } from "../styles";
import type { OllamaModelOption } from "../types";
import type { UserSettings } from "../persist/userSettings";

type Tab = "general" | "image-generation";

type ComfyUITestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok" }
  | { status: "err"; message: string };

const SIZE_PRESETS = [
  { label: "512x512 - Square", width: 512, height: 512 },
  { label: "512x768 - Portrait", width: 512, height: 768 },
  { label: "768x512 - Landscape", width: 768, height: 512 },
  { label: "768x768 - Square", width: 768, height: 768 },
  { label: "768x1024 - Portrait", width: 768, height: 1024 },
  { label: "1024x768 - Landscape", width: 1024, height: 768 },
  { label: "1024x1024 - Square", width: 1024, height: 1024 },
  { label: "1440x1440 - Square", width: 1440, height: 1440 },
] as const;

function sizeKey(w: number, h: number): string {
  return `${w}x${h}`;
}

function parseSize(key: string): { width: number; height: number } {
  const preset = SIZE_PRESETS.find((p) => sizeKey(p.width, p.height) === key);
  if (preset) return { width: preset.width, height: preset.height };
  return { width: 1440, height: 1440 };
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[0.875rem] text-foreground placeholder:text-muted-foreground transition-colors focus:border-border focus:outline-none";
const selectClass =
  "flex h-10 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[0.875rem] text-foreground transition-colors focus:border-border focus:outline-none";
const hintClass = "text-[0.75rem] text-muted-foreground";
const labelClass = "block text-[0.875rem] font-medium text-foreground";

export function SettingsPage({
  ollamaModels,
  currentSettings,
  ollamaHost,
  comfyuiHost,
  comfyuiConnected,
  comfyuiDefaultModel,
  comfyuiDefaultWidth,
  comfyuiDefaultHeight,
  onSave,
  onBack,
}: {
  ollamaModels: OllamaModelOption[];
  currentSettings: UserSettings;
  ollamaHost: string;
  comfyuiHost: string;
  comfyuiConnected: boolean | null;
  comfyuiDefaultModel: string;
  comfyuiDefaultWidth: number;
  comfyuiDefaultHeight: number;
  onSave: (
    settings: UserSettings,
    ollamaHost: string,
    comfyui?: { host: string; defaultModel: string; defaultWidth: number; defaultHeight: number },
  ) => Promise<void>;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>("general");
  const [settings, setSettings] = useState<UserSettings>(currentSettings);
  const [ollamaUri, setOllamaUri] = useState(ollamaHost);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "ok"; version: string } | { status: "err"; message: string }
  >({ status: "idle" });

  // ComfyUI local state
  const [comfyUri, setComfyUri] = useState(comfyuiHost);
  const [comfyModel, setComfyModel] = useState(comfyuiDefaultModel);
  const [comfySize, setComfySize] = useState(sizeKey(comfyuiDefaultWidth, comfyuiDefaultHeight));
  const [comfyModels, setComfyModels] = useState<string[]>([]);
  const [comfyTestState, setComfyTestState] = useState<ComfyUITestState>({ status: "idle" });

  useEffect(() => { setSettings(currentSettings); }, [currentSettings]);
  useEffect(() => { setOllamaUri(ollamaHost); }, [ollamaHost]);
  useEffect(() => { setComfyUri(comfyuiHost); }, [comfyuiHost]);
  useEffect(() => { setComfyModel(comfyuiDefaultModel); }, [comfyuiDefaultModel]);
  useEffect(() => { setComfySize(sizeKey(comfyuiDefaultWidth, comfyuiDefaultHeight)); }, [comfyuiDefaultWidth, comfyuiDefaultHeight]);

  useEffect(() => {
    if (comfyuiConnected) {
      void (async () => {
        try {
          const res = await fetch("/api/comfyui/models");
          const data = (await res.json()) as { models?: string[] };
          if (Array.isArray(data.models)) setComfyModels(data.models);
        } catch { /* ignore */ }
      })();
    }
  }, [comfyuiConnected]);

  const handleChange = useCallback((field: keyof UserSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleTestOllama = useCallback(async () => {
    setTestState({ status: "loading" });
    setError(null);
    try {
      const res = await fetch("/api/ollama/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: ollamaUri }),
      });
      const data = (await res.json()) as { ok?: boolean; version?: string; error?: string };
      if (data.ok && typeof data.version === "string") {
        setTestState({ status: "ok", version: data.version });
      } else {
        setTestState({ status: "err", message: data.error || "Connection failed" });
      }
    } catch (e) {
      setTestState({ status: "err", message: e instanceof Error ? e.message : String(e) });
    }
  }, [ollamaUri]);

  const handleTestComfyUI = useCallback(async () => {
    setComfyTestState({ status: "loading" });
    try {
      const res = await fetch("/api/comfyui/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: comfyUri }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setComfyTestState({ status: "ok" });
        try {
          const mRes = await fetch("/api/comfyui/models");
          const mData = (await mRes.json()) as { models?: string[] };
          if (Array.isArray(mData.models)) setComfyModels(mData.models);
        } catch { /* ignore */ }
      } else {
        setComfyTestState({ status: "err", message: data.error || "Connection failed" });
      }
    } catch (e) {
      setComfyTestState({ status: "err", message: e instanceof Error ? e.message : String(e) });
    }
  }, [comfyUri]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSaving(true);
      setError(null);
      try {
        const { width, height } = parseSize(comfySize);
        await onSave(settings, ollamaUri, {
          host: comfyUri,
          defaultModel: comfyModel,
          defaultWidth: width,
          defaultHeight: height,
        });
        setTestState({ status: "idle" });
        setComfyTestState({ status: "idle" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save settings");
      } finally {
        setIsSaving(false);
      }
    },
    [settings, ollamaUri, comfyUri, comfyModel, comfySize, onSave],
  );

  const availableModels = ollamaModels.map((m) => m.name);
  const tabButtonClass = (t: Tab) =>
    cx(
      "px-4 py-2 text-[0.8125rem] font-medium transition-colors rounded-t-md border-b-2",
      tab === t
        ? "border-foreground text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-background px-5 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Back to chat
        </button>
        <div className="h-4 w-px bg-border-subtle" />
        <h1 className="text-[0.9375rem] font-semibold text-foreground">Settings</h1>
      </header>

      <div className="flex shrink-0 gap-1 border-b border-border-subtle px-5">
        <button type="button" className={tabButtonClass("general")} onClick={() => setTab("general")}>
          General
        </button>
        <button type="button" className={tabButtonClass("image-generation")} onClick={() => setTab("image-generation")}>
          Image Generation
        </button>
      </div>

      <main className="flex-1 overflow-y-auto p-6">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          {tab === "general" && (
            <div className="space-y-4">
              <div>
                <h2 className={cx(eyebrowText, "mb-4")}>Personal Information</h2>
                <div className="space-y-2">
                  <label htmlFor="name" className={labelClass}>
                    Name <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={settings.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    placeholder="Enter your name"
                    className={inputClass}
                  />
                  <p className={hintClass}>Your name will be used in conversations and messages.</p>
                </div>
                <div className="space-y-2 mt-4">
                  <label htmlFor="location" className={labelClass}>
                    Location <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <input
                    type="text"
                    id="location"
                    value={settings.location}
                    onChange={(e) => handleChange("location", e.target.value)}
                    placeholder="e.g., New York, USA"
                    className={inputClass}
                  />
                  <p className={hintClass}>Your location can help provide more relevant responses.</p>
                </div>
              </div>

              <hr className="border-border-subtle" />

              <div className="space-y-4">
                <h2 className={cx(eyebrowText, "mb-4")}>Preferences</h2>
                <div className="space-y-2">
                  <label htmlFor="preferredFormats" className={labelClass}>
                    Preferred Response Formats <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <textarea
                    id="preferredFormats"
                    value={settings.preferredFormats}
                    onChange={(e) => handleChange("preferredFormats", e.target.value)}
                    placeholder="e.g., JSON, Markdown tables, bullet points, code snippets"
                    rows={3}
                    className="min-h-[100px] w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[0.875rem] text-foreground placeholder:text-muted-foreground transition-colors focus:border-border focus:outline-none"
                  />
                  <p className={hintClass}>Specify how you prefer responses to be formatted.</p>
                </div>
              </div>

              <hr className="border-border-subtle" />

              <div className="space-y-4">
                <h2 className={cx(eyebrowText, "mb-4")}>Ollama</h2>
                <div className="space-y-2">
                  <label htmlFor="ollamaUri" className={labelClass}>Server URL</label>
                  <div className="flex flex-wrap items-stretch gap-2 sm:flex-nowrap">
                    <input
                      type="text"
                      id="ollamaUri"
                      name="ollamaUri"
                      value={ollamaUri}
                      onChange={(e) => { setOllamaUri(e.target.value); setTestState({ status: "idle" }); }}
                      placeholder="http://127.0.0.1:11434"
                      autoComplete="off"
                      className={cx(inputClass, "min-w-0 flex-1")}
                    />
                    <button
                      type="button"
                      onClick={() => void handleTestOllama()}
                      disabled={testState.status === "loading"}
                      className="shrink-0 rounded-lg border border-border-subtle bg-muted/40 px-3 py-2 text-[0.875rem] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      {testState.status === "loading" ? "Testing\u2026" : "Test connection"}
                    </button>
                  </div>
                  <p className={hintClass}>
                    Leave empty to use the default local Ollama address (http://127.0.0.1:11434).
                  </p>
                  {testState.status === "ok" && (
                    <p className="text-[0.75rem] text-emerald-500/90">
                      Connected — Ollama version {testState.version}
                    </p>
                  )}
                  {testState.status === "err" && (
                    <p className="text-[0.75rem] text-red-400">{testState.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label htmlFor="defaultModel" className={labelClass}>Default Model</label>
                  <select
                    id="defaultModel"
                    value={settings.defaultModel}
                    onChange={(e) => handleChange("defaultModel", e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Select a default model</option>
                    {availableModels.map((modelName) => (
                      <option key={modelName} value={modelName}>{modelName}</option>
                    ))}
                  </select>
                  <p className={hintClass}>This model will be used for new conversations.</p>
                </div>
              </div>
            </div>
          )}

          {tab === "image-generation" && (
            <div className="space-y-4">
              <h2 className={cx(eyebrowText, "mb-4")}>ComfyUI</h2>

              <div className="space-y-2">
                <label htmlFor="comfyUri" className={labelClass}>Server URL</label>
                <div className="flex flex-wrap items-stretch gap-2 sm:flex-nowrap">
                  <input
                    type="text"
                    id="comfyUri"
                    value={comfyUri}
                    onChange={(e) => { setComfyUri(e.target.value); setComfyTestState({ status: "idle" }); }}
                    placeholder="http://127.0.0.1:8188"
                    autoComplete="off"
                    className={cx(inputClass, "min-w-0 flex-1")}
                  />
                  <button
                    type="button"
                    onClick={() => void handleTestComfyUI()}
                    disabled={comfyTestState.status === "loading"}
                    className="shrink-0 rounded-lg border border-border-subtle bg-muted/40 px-3 py-2 text-[0.875rem] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    {comfyTestState.status === "loading" ? "Testing\u2026" : "Test connection"}
                  </button>
                </div>
                <p className={hintClass}>
                  Leave empty to use the default local ComfyUI address (http://127.0.0.1:8188).
                </p>
                {comfyuiConnected === true && comfyTestState.status === "idle" && (
                  <p className="text-[0.75rem] text-emerald-500/90">Connected</p>
                )}
                {comfyTestState.status === "ok" && (
                  <p className="text-[0.75rem] text-emerald-500/90">Connected</p>
                )}
                {comfyTestState.status === "err" && (
                  <p className="text-[0.75rem] text-red-400">{comfyTestState.message}</p>
                )}
              </div>

              <hr className="border-border-subtle" />

              <div className="space-y-2">
                <label htmlFor="comfyModel" className={labelClass}>Default Checkpoint Model</label>
                <select
                  id="comfyModel"
                  value={comfyModel}
                  onChange={(e) => setComfyModel(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Auto (first available)</option>
                  {comfyModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className={hintClass}>
                  The checkpoint model used for image generation. Leave empty to use the first available model.
                </p>
              </div>

              <hr className="border-border-subtle" />

              <div className="space-y-2">
                <label htmlFor="comfySize" className={labelClass}>Default Image Size</label>
                <select
                  id="comfySize"
                  value={comfySize}
                  onChange={(e) => setComfySize(e.target.value)}
                  className={selectClass}
                >
                  {SIZE_PRESETS.map((p) => {
                    const key = sizeKey(p.width, p.height);
                    return <option key={key} value={key}>{p.label}</option>;
                  })}
                </select>
                <p className={hintClass}>Default resolution for generated images.</p>
              </div>
            </div>
          )}

          <div className="flex justify-end border-t border-border-subtle pt-6">
            <button
              type="submit"
              disabled={isSaving}
              className={cx(primaryButton, isSaving && "opacity-70")}
            >
              <Save size={15} />
              {isSaving ? "Saving..." : "Save settings"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
