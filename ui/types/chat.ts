/** Nested subagent run attached to a tool_call step (from RunContext.wireSteps). */
export interface SubagentRun {
  agentName?: string;
  prompt?: string;
  steps?: MessageStep[];
}

export interface MessageStep {
  kind: string;
  status?: string;
  toolName?: string;
  agentName?: string;
  args?: any;
  thinking?: string;
  result?: string;
  error?: string;
  childRun?: SubagentRun;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  steps?: MessageStep[];
}

/** Confirm truncate + retry/edit from chat UI */
export type TruncateConfirmState =
  | { kind: "edit"; userIndex: number; text: string }
  | { kind: "retry"; userIndex: number }
  | null;

export interface SessionSummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  preview: string;
}

export interface DebugData {
  systemPrompt: string;
  history: Message[];
  customTitle?: string | null;
  /** Cumulative Ollama `messages` (excludes system); next turn prepends system and appends the new user message. */
  modelMessages?: Array<Record<string, unknown>> | null;
}
