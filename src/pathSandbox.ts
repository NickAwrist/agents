import { isAbsolute, relative, resolve } from "node:path";

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxError";
  }
}

/**
 * Ensures `resolvedAbs` is contained within `sessionDir` (both must be absolute, normalized).
 */
export function assertInsideSessionDir(
  resolvedAbs: string,
  sessionDir: string,
): void {
  const base = resolve(sessionDir);
  const target = resolve(resolvedAbs);
  const rel = relative(base, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new SandboxError(`Path escapes session directory: ${target}`);
  }
}
