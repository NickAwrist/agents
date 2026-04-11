import type { AgentData } from "../../persist/agents";

export type AgentEditorState = {
  name: string;
  description: string;
  system_prompt: string;
  include_personalization: number;
  tools: string[];
};
