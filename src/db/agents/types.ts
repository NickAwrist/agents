export type AgentRow = {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  is_default: number;
  created_at: number;
  updated_at: number;
};

export type AgentWithTools = AgentRow & { tools: string[] };
