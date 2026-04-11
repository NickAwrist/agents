import type { Message } from "../types";

const SEP = "\n\n";

function block(roleLabel: "USER" | "MODEL", content: string): string {
  return `${roleLabel}\n===\n${content}`;
}

/**
 * Full chat export: alternating USER / MODEL blocks with `===` under each label.
 * Optionally appends the in-flight assistant reply when `streamingAssistant` is non-empty.
 */
export function formatChatTranscript(
  messages: Message[],
  options?: { streamingAssistant?: string },
): string {
  const parts: string[] = [];
  for (const m of messages) {
    const label = m.role === "user" ? "USER" : "MODEL";
    parts.push(block(label, m.content));
  }
  const stream = options?.streamingAssistant;
  if (stream != null && stream.trim()) parts.push(block("MODEL", stream));
  return parts.join(SEP);
}
