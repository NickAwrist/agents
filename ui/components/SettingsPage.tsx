import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { cx, eyebrowText, primaryButton } from "../styles";
import type { OllamaModelOption } from "../types";
import type { UserSettings } from "../persist/userSettings";

export function SettingsPage({
  ollamaModels,
  currentSettings,
  ollamaHost,
  onSave,
  onBack,
}: {
  ollamaModels: OllamaModelOption[];
  currentSettings: UserSettings;
  ollamaHost: string;
  onSave: (settings: UserSettings, ollamaHost: string) => Promise<void>;
  onBack: () => void;
}) {
  const [settings, setSettings] = useState<UserSettings>(currentSettings);
  const [ollamaUri, setOllamaUri] = useState(ollamaHost);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "ok"; version: string } | { status: "err"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    setSettings(currentSettings);
  }, [currentSettings]);

  useEffect(() => {
    setOllamaUri(ollamaHost);
  }, [ollamaHost]);

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
      const data = (await res.json()) as {
        ok?: boolean;
        version?: string;
        error?: string;
      };
      if (data.ok && typeof data.version === "string") {
        setTestState({ status: "ok", version: data.version });
      } else {
        setTestState({ status: "err", message: data.error || "Connection failed" });
      }
    } catch (e) {
      setTestState({ status: "err", message: e instanceof Error ? e.message : String(e) });
    }
  }, [ollamaUri]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSaving(true);
      setError(null);
      try {
        await onSave(settings, ollamaUri);
        setTestState({ status: "idle" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save settings");
      } finally {
        setIsSaving(false);
      }
    },
    [settings, ollamaUri, onSave]
  );

  const availableModels = ollamaModels.map((m) => m.name);

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

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <h2 className={cx(eyebrowText, "mb-4")}>Personal Information</h2>

              {/* Name Field */}
              <div className="space-y-2">
                <label
                  htmlFor="name"
                  className="block text-[0.875rem] font-medium text-foreground"
                >
                  Name <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="text"
                  id="name"
                  value={settings.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="Enter your name"
                  className="flex h-10 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[0.875rem] text-foreground placeholder:text-muted-foreground transition-colors focus:border-border focus:outline-none"
                />
                <p className="text-[0.75rem] text-muted-foreground">
                  Your name will be used in conversations and messages.
                </p>
              </div>

              {/* Location Field */}
              <div className="space-y-2">
                <label
                  htmlFor="location"
                  className="block text-[0.875rem] font-medium text-foreground"
                >
                  Location <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  type="text"
                  id="location"
                  value={settings.location}
                  onChange={(e) => handleChange("location", e.target.value)}
                  placeholder="e.g., New York, USA"
                  className="flex h-10 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[0.875rem] text-foreground placeholder:text-muted-foreground transition-colors focus:border-border focus:outline-none"
                />
                <p className="text-[0.75rem] text-muted-foreground">
                  Your location can help provide more relevant responses.
                </p>
              </div>
            </div>

            <hr className="border-border-subtle" />

            <div className="space-y-4">
              <h2 className={cx(eyebrowText, "mb-4")}>Preferences</h2>

              {/* Preferred Response Formats */}
              <div className="space-y-2">
                <label
                  htmlFor="preferredFormats"
                  className="block text-[0.875rem] font-medium text-foreground"
                >
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
                <p className="text-[0.75rem] text-muted-foreground">
                  Specify how you prefer responses to be formatted.
                </p>
              </div>
            </div>

            <hr className="border-border-subtle" />

            <div className="space-y-4">
              <h2 className={cx(eyebrowText, "mb-4")}>Ollama</h2>

              <div className="space-y-2">
                <label
                  htmlFor="ollamaUri"
                  className="block text-[0.875rem] font-medium text-foreground"
                >
                  Server URL
                </label>
                <div className="flex flex-wrap items-stretch gap-2 sm:flex-nowrap">
                  <input
                    type="text"
                    id="ollamaUri"
                    name="ollamaUri"
                    value={ollamaUri}
                    onChange={(e) => {
                      setOllamaUri(e.target.value);
                      setTestState({ status: "idle" });
                    }}
                    placeholder="http://127.0.0.1:11434"
                    autoComplete="off"
                    className="min-h-10 min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[0.875rem] text-foreground placeholder:text-muted-foreground transition-colors focus:border-border focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleTestOllama()}
                    disabled={testState.status === "loading"}
                    className="shrink-0 rounded-lg border border-border-subtle bg-muted/40 px-3 py-2 text-[0.875rem] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    {testState.status === "loading" ? "Testing…" : "Test connection"}
                  </button>
                </div>
                <p className="text-[0.75rem] text-muted-foreground">
                  Leave empty to use the default local Ollama address (http://127.0.0.1:11434). Use another host or
                  port if Ollama runs elsewhere.
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
                <label
                  htmlFor="defaultModel"
                  className="block text-[0.875rem] font-medium text-foreground"
                >
                  Default Model
                </label>
                <select
                  id="defaultModel"
                  value={settings.defaultModel}
                  onChange={(e) => handleChange("defaultModel", e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[0.875rem] text-foreground transition-colors focus:border-border focus:outline-none"
                >
                  <option value="">Select a default model</option>
                  {availableModels.map((modelName) => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                </select>
                <p className="text-[0.75rem] text-muted-foreground">
                  This model will be used for new conversations.
                </p>
              </div>
            </div>
          </div>

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
