import type { ComfyUIConfigPayload, OllamaModelOption } from "../../types";
import type { UserSettings } from "../../persist/userSettings";

export type SettingsTab = "general" | "image-generation";

export type ComfyUITestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok" }
  | { status: "err"; message: string };

export type OllamaTestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; version: string }
  | { status: "err"; message: string };

export type SettingsPageProps = {
  ollamaModels: OllamaModelOption[];
  currentSettings: UserSettings;
  ollamaHost: string;
  comfyuiHost: string;
  comfyuiConnected: boolean | null;
  comfyuiDefaultModel: string;
  comfyuiDefaultWidth: number;
  comfyuiDefaultHeight: number;
  comfyuiNegativePrompt: string;
  onSave: (settings: UserSettings, ollamaHost: string, comfyui?: ComfyUIConfigPayload) => Promise<void>;
  onBack: () => void;
};
