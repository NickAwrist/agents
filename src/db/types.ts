export type WireMessage = {
  role: string;
  content: string;
  steps?: unknown;
};

export type SessionRow = {
  id: string;
  created_at: number;
  updated_at: number;
  title: string | null;
  model: string | null;
  model_messages: string | null;
  agent_name: string | null;
  session_directory: string | null;
};

export type SessionSummaryRow = {
  id: string;
  created_at: number;
  updated_at: number;
  preview: string;
};
