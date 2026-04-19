import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { SandboxError, assertInsideSessionDir } from "./pathSandbox";

export { SandboxError };

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
export function pickSessionDirectoryRaw(
  bodyDir: unknown,
  storedDir: string | null | undefined,
): string {
  const fromBody = typeof bodyDir === "string" ? bodyDir.trim() : "";
  if (fromBody.length > 0) return fromBody;
  return (storedDir ?? "").trim();
}

/** Directory tools use: explicit session path or user home when unset. */
export function resolveEffectiveToolSessionDir(
  bodyDir: unknown,
  storedDir: string | null | undefined,
): string {
  const raw = pickSessionDirectoryRaw(bodyDir, storedDir);
  if (!raw) return homedir();
  return expandUserPath(raw);
}

export type ResolveToolPathOptions = {
  /** When true and `sessionDir` is set, reject paths outside the session directory. */
  enforceSandbox?: boolean;
};

/** Resolve relative paths against session working directory. */
export function resolveToolFilePath(
  filePath: string,
  sessionDir?: string,
  opts?: ResolveToolPathOptions,
): string {
  const p = typeof filePath === "string" ? filePath.trim() : "";
  if (!p) return p;
  let resolved: string;
  if (isAbsolute(p)) {
    resolved = resolve(p);
  } else {
    const base = sessionDir?.trim();
    if (!base) resolved = resolve(p);
    else resolved = resolve(base, p);
  }
  if (opts?.enforceSandbox && sessionDir?.trim()) {
    assertInsideSessionDir(resolved, sessionDir.trim());
  }
  return resolved;
}
