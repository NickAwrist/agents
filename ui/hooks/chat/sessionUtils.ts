import type { UserSettings } from "../../persist/userSettings";

/** Model for new chats: Settings default, else server default (not the active session's model). */
export function effectiveDefaultChatModel(settings: UserSettings, serverDefault: string): string {
  const u = settings.defaultModel.trim();
  return u || serverDefault;
}

export function newEphemeralSessionId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
