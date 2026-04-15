import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/** Expand ~ and resolve to an absolute path for tool cwd / prompts. */
export function expandUserPath(input: string): string {
  const t = input.trim();
  if (!t) return homedir();
  if (t === "~" || t.startsWith("~/")) {
    return t === "~" ? homedir() : join(homedir(), t.slice(2));
  }
  if (t.startsWith("~\\")) {
    return join(homedir(), t.slice(2));
  }
  if (isAbsolute(t)) return resolve(t);
  return resolve(process.cwd(), t);
}

/** Prefer request body, then stored session value (trimmed). */
export function pickSessionDirectoryRaw(bodyDir: unknown, storedDir: string | null | undefined): string {
  const fromBody = typeof bodyDir === "string" ? bodyDir.trim() : "";
  if (fromBody.length > 0) return fromBody;
  return (storedDir ?? "").trim();
}

/** Directory tools use: explicit session path or user home when unset. */
export function resolveEffectiveToolSessionDir(bodyDir: unknown, storedDir: string | null | undefined): string {
  const raw = pickSessionDirectoryRaw(bodyDir, storedDir);
  if (!raw) return homedir();
  return expandUserPath(raw);
}

export function formatSessionDirectoryPromptBlock(absResolvedPath: string): string {
  return `--- Session context ---\nSession directory: ${absResolvedPath}`;
}

/** Resolve relative paths against session working directory. */
export function resolveToolFilePath(filePath: string, sessionDir?: string): string {
  const p = typeof filePath === "string" ? filePath.trim() : "";
  if (!p) return p;
  if (isAbsolute(p)) return resolve(p);
  const base = sessionDir?.trim();
  if (!base) return resolve(p);
  return resolve(base, p);
}
