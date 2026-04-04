import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";
import type { QueryLog } from "./QueryLog";

/** Repo root (agents/), not process.cwd() — so logs land next to src/ no matter where you run bun from. */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_DIR = path.join(PROJECT_ROOT, "logs", "queries");

/** Writes one JSON file per query under logs/queries/{queryId}.json */
export async function persistQueryLog(
  queryLog: QueryLog,
  dir: string = process.env.QUERY_LOG_DIR ?? DEFAULT_DIR,
): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${queryLog.queryId}.json`);
  const body = JSON.stringify(queryLog.toJSON(), null, 2);
  await fs.writeFile(filePath, body, "utf8");
  return path.resolve(filePath);
}

export function getDefaultQueryLogDir(): string {
  return path.resolve(DEFAULT_DIR);
}
