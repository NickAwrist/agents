import fs from "fs/promises";
import pathModule from "path";
import ignore, { type Ignore } from "ignore";

let cachedIg: { dir: string; ig: Ignore } | null = null;

/**
 * Walk from `startDir` up to the filesystem root, collecting all `.gitignore`
 * files along the way (child rules first so they override parents).
 * Returns a combined `ignore` instance.
 */
export async function loadGitignore(startDir?: string): Promise<Ignore> {
  const dir = startDir ?? process.cwd();

  if (cachedIg && cachedIg.dir === dir) return cachedIg.ig;

  const ig = ignore();
  const parts: string[] = [];
  let current = pathModule.resolve(dir);

  while (true) {
    try {
      const content = await fs.readFile(pathModule.join(current, ".gitignore"), "utf-8");
      parts.push(content);
    } catch {
      // no .gitignore at this level
    }

    // stop at git root or filesystem root
    const isGitRoot = await fs
      .stat(pathModule.join(current, ".git"))
      .then(() => true)
      .catch(() => false);
    if (isGitRoot) break;

    const parent = pathModule.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // Apply from root down so child rules layer on top
  for (let i = parts.length - 1; i >= 0; i--) {
    ig.add(parts[i]!);
  }

  cachedIg = { dir, ig };
  return ig;
}

/**
 * Map a loose path token from command output to a path the `ignore` package
 * accepts (same shape as `path.relative(cwd, abs)`). Returns null if the token
 * is not a plausible repo-relative path — then we must not filter the line.
 */
function normalizePathTokenForIgnore(
  token: string,
  cwd: string,
): string | null {
  let t = token.trim().replace(/\/+$/, "").replace(/:+$/, "");
  if (!t) return null;

  let abs: string;
  try {
    abs = pathModule.resolve(cwd, t);
  } catch {
    return null;
  }

  const rel = pathModule.relative(cwd, abs);
  if (rel.startsWith("..") || pathModule.isAbsolute(rel)) {
    return null;
  }
  if (!rel) {
    return "";
  }

  return rel.split(pathModule.sep).join("/");
}

/**
 * GNU `ls -R` / `ls -lR` prints `path/to/dir:` on its own line before that
 * directory's entries. We only treat lines as headers when the path looks like
 * real `ls` output (avoids false positives such as `error:`).
 */
function parseLsDirectoryHeader(trimmed: string): string | null {
  const m = trimmed.match(/^(.+):\s*$/);
  if (!m) return null;
  const p = m[1]!.trim();
  if (!p || p.includes("://")) return null;
  // `ls -R` headers are single path tokens (no spaces); avoids `error: msg` etc.
  if (p.includes(" ")) return null;
  if (p === ".") return ".";
  if (p.startsWith("./") || p.startsWith("/") || p.includes("/")) {
    return p;
  }
  return null;
}

function joinRelDir(base: string, segment: string): string {
  const s = segment.replace(/\/+$/, "");
  if (!s) return base;
  if (!base) return s.split(pathModule.sep).join("/");
  return pathModule.join(base, s).split(pathModule.sep).join("/");
}

/**
 * Filter lines of tool output, removing any line whose primary path-like token
 * matches a gitignored pattern. Returns the filtered output and the count of
 * removed lines.
 */
export function filterOutputLines(
  output: string,
  ig: Ignore,
  cwd: string = process.cwd(),
): { filtered: string; removedCount: number } {
  const lines = output.split("\n");
  const kept: string[] = [];
  let removedCount = 0;
  /** Repo-relative dir for the current `ls -R` block (`""` = cwd). Null = not in that format yet. */
  let lsListingDir: string | null = null;
  let lsListingIgnored = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const headerPathRaw = trimmed ? parseLsDirectoryHeader(trimmed) : null;

    if (!trimmed) {
      if (lsListingIgnored) {
        removedCount++;
      } else {
        kept.push(line);
      }
      continue;
    }

    if (headerPathRaw !== null) {
      const norm = normalizePathTokenForIgnore(headerPathRaw, cwd);
      lsListingDir = norm;
      if (norm && ig.ignores(norm)) {
        lsListingIgnored = true;
        removedCount++;
      } else {
        lsListingIgnored = false;
        kept.push(line);
      }
      continue;
    }

    if (lsListingIgnored) {
      removedCount++;
      continue;
    }

    if (/^total\s+\d+\s*$/.test(trimmed)) {
      kept.push(line);
      continue;
    }

    const token = extractPathToken(line) ?? trimmed;
    let relForIgnore: string | null = null;
    if (lsListingDir !== null) {
      const t = token.replace(/\/+$/, "");
      relForIgnore = joinRelDir(lsListingDir, t);
    } else {
      relForIgnore = normalizePathTokenForIgnore(token, cwd);
    }

    if (relForIgnore && ig.ignores(relForIgnore)) {
      removedCount++;
    } else {
      kept.push(line);
    }
  }

  return { filtered: kept.join("\n"), removedCount };
}

/**
 * Try to extract the most "path-like" token from a line of output.
 * Handles common formats: plain filenames, `ls -l` style, `find` output,
 * `tree` output, `grep`-style `file:line:` prefixes, etc.
 */
function extractPathToken(line: string): string | null {
  // tree-style lines: strip leading box-drawing characters and whitespace
  const treeStripped = line.replace(/^[│├└─┬┤\s|`\\+-]+/, "").trim();
  if (treeStripped && !treeStripped.includes(" ")) {
    return treeStripped.replace(/\/$/, "");
  }

  // grep-style: `path/file:123: content` -> extract path
  const grepMatch = line.match(/^([^\s:]+):\d+:/);
  if (grepMatch) {
    return grepMatch[1]!;
  }

  // ls -l style: last token is the filename
  // e.g. "drwxr-xr-x  3 user group  4096 Jan  1 00:00 node_modules"
  const lsMatch = line.match(
    /^[d\-lrwxsStT][\-rwxsStT]{8,}\s+/,
  );
  if (lsMatch) {
    const parts = line.split(/\s+/);
    const last = parts[parts.length - 1];
    if (last) return last.replace(/\/$/, "");
  }

  // Simple: if the whole line (trimmed) has no spaces and looks like a path
  if (!line.includes(" ") || line.match(/^\.?\//)) {
    const candidate = line.trim().replace(/\/$/, "");
    if (candidate) return candidate;
  }

  // Space-separated tokens: take the last one if it looks path-like
  const tokens = line.trim().split(/\s+/);
  const last = tokens[tokens.length - 1];
  if (last && (last.includes("/") || last.includes("."))) {
    return last.replace(/\/$/, "");
  }

  return null;
}
