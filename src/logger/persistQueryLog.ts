import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";
import type { QueryLog } from "./QueryLog";
import { buildQueryLogViewerHtml } from "./queryLogViewerHtml";

/** Repo root (agents/), not process.cwd() — so logs land next to src/ no matter where you run bun from. */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_DIR = path.join(PROJECT_ROOT, "logs", "queries");

export type PersistQueryLogResult = {
  jsonPath: string;
  htmlPath: string;
};

/** Writes logs/queries/{queryId}.json and a self-contained {queryId}.html viewer beside it. */
export async function persistQueryLog(
  queryLog: QueryLog,
  dir: string = process.env.QUERY_LOG_DIR ?? DEFAULT_DIR,
): Promise<PersistQueryLogResult> {
  await fs.mkdir(dir, { recursive: true });
  const json = queryLog.toJSON() as Record<string, unknown>;
  const jsonPath = path.join(dir, `${queryLog.queryId}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(json, null, 2), "utf8");
  const htmlPath = path.join(dir, `${queryLog.queryId}.html`);
  await fs.writeFile(htmlPath, buildQueryLogViewerHtml(json), "utf8");
  return { jsonPath: path.resolve(jsonPath), htmlPath: path.resolve(htmlPath) };
}

export function getDefaultQueryLogDir(): string {
  return path.resolve(DEFAULT_DIR);
}
