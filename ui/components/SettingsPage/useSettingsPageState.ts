import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { UserSettings } from "../../persist/userSettings";
import type { ComfyUIConfigPayload, OllamaModelOption } from "../../types";
import { parseSize, sizeKey } from "./constants";
import type { ComfyUITestState, OllamaTestState, SettingsTab } from "./types";

type Args = {
  ollamaModels: OllamaModelOption[];
  currentSettings: UserSettings;
  ollamaHost: string;
  ollamaConnected: boolean | null;
  comfyuiHost: string;
  comfyuiConnected: boolean | null;
  comfyuiDefaultModel: string;
  comfyuiDefaultWidth: number;
  comfyuiDefaultHeight: number;
  comfyuiNegativePrompt: string;
  onSave: (settings: UserSettings, ollamaHost: string, comfyui?: ComfyUIConfigPayload) => Promise<void>;
};

export function useSettingsPageState({
  ollamaModels,
  currentSettings,
  ollamaHost,
  ollamaConnected,
  comfyuiHost,
  comfyuiConnected,
  comfyuiDefaultModel,
  comfyuiDefaultWidth,
  comfyuiDefaultHeight,
  comfyuiNegativePrompt,
  onSave,
}: Args) {
  const [tab, setTab] = useState<SettingsTab>("general");
  const [settings, setSettings] = useState<UserSettings>(currentSettings);
  const [ollamaUri, setOllamaUri] = useState(ollamaHost);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<OllamaTestState>({ status: "idle" });

  const [comfyUri, setComfyUri] = useState(comfyuiHost);
  const [comfyModel, setComfyModel] = useState(comfyuiDefaultModel);
  const [comfySize, setComfySize] = useState(sizeKey(comfyuiDefaultWidth, comfyuiDefaultHeight));
  const [comfyModels, setComfyModels] = useState<string[]>([]);
  const [comfyTestState, setComfyTestState] = useState<ComfyUITestState>({ status: "idle" });
  const [comfyNegative, setComfyNegative] = useState(comfyuiNegativePrompt);

  useEffect(() => {
    setSettings(currentSettings);
  }, [currentSettings]);
  useEffect(() => {
    setOllamaUri(ollamaHost);
  }, [ollamaHost]);
  useEffect(() => {
    setComfyUri(comfyuiHost);
  }, [comfyuiHost]);
  useEffect(() => {
    setComfyModel(comfyuiDefaultModel);
  }, [comfyuiDefaultModel]);
  useEffect(() => {
    setComfySize(sizeKey(comfyuiDefaultWidth, comfyuiDefaultHeight));
  }, [comfyuiDefaultWidth, comfyuiDefaultHeight]);
  useEffect(() => {
    setComfyNegative(comfyuiNegativePrompt);
  }, [comfyuiNegativePrompt]);

  useEffect(() => {
    if (comfyuiConnected) {
      void (async () => {
        try {
          const res = await fetch("/api/comfyui/models");
          const data = (await res.json()) as { models?: string[] };
          if (Array.isArray(data.models)) setComfyModels(data.models);
        } catch {
          /* ignore */
        }
      })();
    }
  }, [comfyuiConnected]);

  const handleChange = useCallback((field: keyof UserSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleTestOllama = useCallback(async () => {
    setTestState((prev) => {
      if (prev.status === "ok") {
        return { status: "loading", previousVersion: prev.version };
      }
      if (prev.status === "idle" && ollamaConnected === true) {
        return { status: "loading", holdSavedConnected: true };
      }
      return { status: "loading" };
    });
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
  }, [ollamaUri, ollamaConnected]);

  const handleTestComfyUI = useCallback(async () => {
    setComfyTestState((prev) => ({
      status: "loading",
      holdConnected: prev.status === "ok" || (prev.status === "idle" && comfyuiConnected === true),
    }));
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
        } catch {
          /* ignore */
        }
      } else {
        setComfyTestState({ status: "err", message: data.error || "Connection failed" });
      }
    } catch (e) {
      setComfyTestState({ status: "err", message: e instanceof Error ? e.message : String(e) });
    }
  }, [comfyUri, comfyuiConnected]);

  const savedComfySize = useMemo(
    () => sizeKey(comfyuiDefaultWidth, comfyuiDefaultHeight),
    [comfyuiDefaultWidth, comfyuiDefaultHeight],
  );

  const isDirty = useMemo(() => {
    if (
      settings.name !== currentSettings.name ||
      settings.preferredFormats !== currentSettings.preferredFormats ||
      settings.location !== currentSettings.location ||
      settings.defaultModel !== currentSettings.defaultModel
    ) {
      return true;
    }
    if (ollamaUri !== ollamaHost) return true;
    if (comfyUri !== comfyuiHost) return true;
    if (comfyModel !== comfyuiDefaultModel) return true;
    if (comfySize !== savedComfySize) return true;
    if (comfyNegative !== comfyuiNegativePrompt) return true;
    return false;
  }, [
    settings,
    currentSettings,
    ollamaUri,
    ollamaHost,
    comfyUri,
    comfyuiHost,
    comfyModel,
    comfyuiDefaultModel,
    comfySize,
    savedComfySize,
    comfyNegative,
    comfyuiNegativePrompt,
  ]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!isDirty) return;
      setIsSaving(true);
      setError(null);
      try {
        const { width, height } = parseSize(comfySize);
        await onSave(settings, ollamaUri, {
          host: comfyUri,
          defaultModel: comfyModel,
          defaultWidth: width,
          defaultHeight: height,
          negativePrompt: comfyNegative,
        });
        setTestState({ status: "idle" });
        setComfyTestState({ status: "idle" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save settings");
      } finally {
        setIsSaving(false);
      }
    },
    [isDirty, settings, ollamaUri, comfyUri, comfyModel, comfySize, comfyNegative, onSave],
  );

  const availableModels = ollamaModels.map((m) => m.name);

  const onOllamaUriInput = useCallback((v: string) => {
    setOllamaUri(v);
    setTestState({ status: "idle" });
  }, []);

  const onComfyUriInput = useCallback((v: string) => {
    setComfyUri(v);
    setComfyTestState({ status: "idle" });
  }, []);

  return {
    tab,
    setTab,
    settings,
    ollamaUri,
    onOllamaUriInput,
    isSaving,
    isDirty,
    error,
    testState,
    comfyUri,
    onComfyUriInput,
    comfyModel,
    setComfyModel,
    comfySize,
    setComfySize,
    comfyModels,
    comfyTestState,
    comfyNegative,
    setComfyNegative,
    handleChange,
    handleTestOllama,
    handleTestComfyUI,
    handleSubmit,
    availableModels,
  };
}
