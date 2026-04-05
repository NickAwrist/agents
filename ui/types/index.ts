export interface SessionSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  preview: string;
}

export interface MessageStep {
  kind: string;
  toolName?: string;
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
}
