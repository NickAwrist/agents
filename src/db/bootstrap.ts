import type { Database } from "bun:sqlite";
import { DEFAULT_CHAT_AGENT_KEY } from "./constants";

export function ensureDefaultChatAgentSetting(db: Database) {
  db.run("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", [
    DEFAULT_CHAT_AGENT_KEY,
    "general_agent",
  ]);
}
