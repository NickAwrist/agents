export interface SessionSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  preview: string;
}

export interface MessageStep {
  kind: string;
  status?: string;
  toolName?: string;
  agentName?: string;
  args?: any;
  thinking?: string;
  result?: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  steps?: MessageStep[];
}

export interface DebugData {
  systemPrompt: string;
  history: Message[];
  customTitle?: string | null;
  /** Cumulative Ollama `messages` (excludes system); next turn prepends system and appends the new user message. */
  modelMessages?: Array<Record<string, unknown>>;
}
