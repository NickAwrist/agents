export const SIZE_PRESETS = [
  { label: "512x512 - Square", width: 512, height: 512 },
  { label: "512x768 - Portrait", width: 512, height: 768 },
  { label: "768x512 - Landscape", width: 768, height: 512 },
  { label: "768x768 - Square", width: 768, height: 768 },
  { label: "768x1024 - Portrait", width: 768, height: 1024 },
  { label: "1024x768 - Landscape", width: 1024, height: 768 },
  { label: "1024x1024 - Square", width: 1024, height: 1024 },
  { label: "1440x1440 - Square", width: 1440, height: 1440 },
] as const;

export function sizeKey(w: number, h: number): string {
  return `${w}x${h}`;
}

export function parseSize(key: string): { width: number; height: number } {
  const preset = SIZE_PRESETS.find((p) => sizeKey(p.width, p.height) === key);
  if (preset) return { width: preset.width, height: preset.height };
  return { width: 1440, height: 1440 };
}

export const inputClass =
  "flex h-10 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[0.875rem] text-foreground placeholder:text-muted-foreground transition-colors focus:border-border focus:outline-none";
export const selectClass =
  "flex h-10 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[0.875rem] text-foreground transition-colors focus:border-border focus:outline-none";
export const hintClass = "text-[0.75rem] text-muted-foreground";
export const labelClass = "block text-[0.875rem] font-medium text-foreground";
