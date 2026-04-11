import type { UserSettings } from "../../persist/userSettings";
import { cx, eyebrowText } from "../../styles";
import { hintClass, inputClass, labelClass, selectClass } from "./constants";
import { ConnectionTestFeedback, ollamaConnectionFeedback } from "./ConnectionTestFeedback";
import type { OllamaTestState } from "./types";

type Props = {
  settings: UserSettings;
  onFieldChange: (field: keyof UserSettings, value: string) => void;
  ollamaUri: string;
  onOllamaUriInput: (v: string) => void;
  ollamaConnected: boolean | null;
  testState: OllamaTestState;
  onTestOllama: () => void;
  availableModels: string[];
};

export function GeneralSettingsTab({
  settings,
  onFieldChange,
  ollamaUri,
  onOllamaUriInput,
  ollamaConnected,
  testState,
  onTestOllama,
  availableModels,
}: Props) {
  return (
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
            onChange={(e) => onFieldChange("name", e.target.value)}
            placeholder="Enter your name"
            className={inputClass}
          />
          <p className={hintClass}>Your name will be used in conversations and messages.</p>
        </div>
        <div className="mt-4 space-y-2">
          <label htmlFor="location" className={labelClass}>
            Location <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            type="text"
            id="location"
            value={settings.location}
            onChange={(e) => onFieldChange("location", e.target.value)}
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
            onChange={(e) => onFieldChange("preferredFormats", e.target.value)}
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
          <label htmlFor="ollamaUri" className={labelClass}>
            Server URL
          </label>
          <div className="flex flex-wrap items-stretch gap-2 sm:flex-nowrap">
            <input
              type="text"
              id="ollamaUri"
              name="ollamaUri"
              value={ollamaUri}
              onChange={(e) => onOllamaUriInput(e.target.value)}
              placeholder="http://127.0.0.1:11434"
              autoComplete="off"
              className={cx(inputClass, "min-w-0 flex-1")}
            />
            <button
              type="button"
              onClick={() => void onTestOllama()}
              disabled={testState.status === "loading"}
              className="shrink-0 rounded-lg border border-border-subtle bg-muted/40 px-3 py-2 text-[0.875rem] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              {testState.status === "loading" ? "Testing…" : "Test connection"}
            </button>
          </div>
          <p className={hintClass}>Leave empty to use the default local Ollama address (http://127.0.0.1:11434).</p>
          <ConnectionTestFeedback {...ollamaConnectionFeedback(testState, ollamaConnected)} />
        </div>
        <div className="space-y-2">
          <label htmlFor="defaultModel" className={labelClass}>
            Default Model
          </label>
          <select
            id="defaultModel"
            value={settings.defaultModel}
            onChange={(e) => onFieldChange("defaultModel", e.target.value)}
            className={selectClass}
          >
            <option value="">Select a default model</option>
            {availableModels.map((modelName) => (
              <option key={modelName} value={modelName}>
                {modelName}
              </option>
            ))}
          </select>
          <p className={hintClass}>This model will be used for new conversations.</p>
        </div>
      </div>
    </div>
  );
}
