import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { cx, eyebrowText, primaryButton } from "../styles";
import type { OllamaModelOption } from "../types";

interface UserSettings {
  name: string;
  preferredFormats: string;
  location: string;
  defaultModel: string;
}

const DEFAULT_SETTINGS: UserSettings = {
  name: "",
  preferredFormats: "",
  location: "",
  defaultModel: "",
};

export function SettingsPage({
  ollamaModels,
  currentSettings,
  onSave,
  onBack,
}: {
  ollamaModels: OllamaModelOption[];
  currentSettings: UserSettings;
  onSave: (settings: UserSettings) => Promise<void>;
  onBack: () => void;
}) {
  const [settings, setSettings] = useState<UserSettings>(currentSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSettings(currentSettings);
  }, [currentSettings]);

  const handleChange = useCallback(
    (field: keyof UserSettings, value: string) => {
      setSettings((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSaving(true);
      setError(null);
      try {
        await onSave(settings);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save settings");
      } finally {
        setIsSaving(false);
      }
    },
    [settings, onSave]
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

              {/* Default Model Selection */}
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
