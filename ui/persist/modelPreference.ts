const KEY = "agents:preferredModel";

export function loadPreferredModel(fallback: string): string {
  try {
    const raw = localStorage.getItem(KEY);
    if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  } catch {
    /* ignore */
  }
  return fallback;
}

export function savePreferredModel(model: string): void {
  try {
    const m = model.trim();
    if (m) localStorage.setItem(KEY, m);
  } catch {
    /* ignore */
  }
}
