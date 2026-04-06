import type { SessionSummary } from "../types";
import type { StoredChatSession } from "./chats";

export function storedSessionToSummary(session: StoredChatSession): SessionSummary {
  const title = session.customTitle?.trim();
  let preview = "New chat";
  if (title) {
    preview = title;
  } else {
    const userMsgs = session.history.filter((h) => h.role === "user");
    if (userMsgs.length > 0) {
      const last = userMsgs[userMsgs.length - 1]?.content || "New chat";
      preview = last.length > 40 ? last.substring(0, 40) + "..." : last;
    }
  }
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    preview,
  };
}
