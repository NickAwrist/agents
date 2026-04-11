const STORAGE_KEY = "agents:userSettings";

export interface UserSettings {
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

export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      name: parsed.name || "",
      preferredFormats: parsed.preferredFormats || "",
      location: parsed.location || "",
      defaultModel: parsed.defaultModel || "",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveUserSettings(settings: UserSettings): void {
  try {
    const toSave = {
      name: settings.name || "",
      preferredFormats: settings.preferredFormats || "",
      location: settings.location || "",
      defaultModel: settings.defaultModel || "",
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Ignore storage errors
  }
}

export function updateUserSettings(updates: Partial<UserSettings>): UserSettings {
  const current = loadUserSettings();
  const updated = { ...current, ...updates };
  saveUserSettings(updated);
  return updated;
}
