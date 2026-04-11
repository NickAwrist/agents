import { Ollama } from "ollama";
import { getOllamaHost } from "./db/index";

let cached: { hostKey: string; client: Ollama } | null = null;

function cacheKey(): string {
  return getOllamaHost() || "__default__";
}

/** Singleton client for the configured Ollama base URL (default matches ollama-js: http://127.0.0.1:11434). */
export function getOllamaClient(): Ollama {
  const key = cacheKey();
  if (!cached || cached.hostKey !== key) {
    const stored = getOllamaHost();
    const client = stored ? new Ollama({ host: stored }) : new Ollama();
    cached = { hostKey: key, client };
  }
  return cached.client;
}

export function invalidateOllamaClientCache(): void {
  cached = null;
}

/** Normalized host string as used by the client (for display). */
export function getResolvedOllamaHost(): string {
  const stored = getOllamaHost();
  const o = stored ? new Ollama({ host: stored }) : new Ollama();
  return (o as unknown as { config: { host: string } }).config.host;
}
