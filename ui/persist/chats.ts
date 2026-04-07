import type { Message } from "../types";

const STORAGE_KEY = "agents:chats:v1";

export type StoredChatSession = {
  id: string;
  createdAt: number;
  updatedAt: number;
  customTitle?: string | null;
  history: Message[];
  modelMessages?: Array<Record<string, unknown>> | null;
};

export function loadChatsV1(): StoredChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: number; sessions?: StoredChatSession[] };
    if (!Array.isArray(parsed.sessions)) return [];
    return parsed.sessions;
  } catch {
    return [];
  }
}

export function saveChatsV1(sessions: StoredChatSession[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, sessions }));
}

export function upsertStoredSession(patch: { id: string } & Partial<Omit<StoredChatSession, "id">>): void {
  const all = loadChatsV1();
  const i = all.findIndex((s) => s.id === patch.id);
  if (i >= 0) {
    const cur = all[i]!;
    all[i] = {
      id: patch.id,
      createdAt: patch.createdAt ?? cur.createdAt,
      updatedAt: patch.updatedAt ?? cur.updatedAt,
      history: patch.history ?? cur.history,
      customTitle: patch.customTitle !== undefined ? patch.customTitle : cur.customTitle,
      modelMessages: patch.modelMessages !== undefined ? patch.modelMessages : cur.modelMessages,
    };
  } else {
    all.push({
      id: patch.id,
      createdAt: patch.createdAt ?? Date.now(),
      updatedAt: patch.updatedAt ?? Date.now(),
      history: patch.history ?? [],
      customTitle: patch.customTitle ?? null,
      modelMessages: patch.modelMessages,
    });
  }
  saveChatsV1(all);
}

export function removeStoredSession(id: string): void {
  saveChatsV1(loadChatsV1().filter((s) => s.id !== id));
}
