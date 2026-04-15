import type { AgentData } from "../../persist/agents";

export type AgentEditorState = {
  name: string;
  description: string;
  system_prompt: string;
  include_personalization: number;
  include_session_directory: number;
  include_os_info: number;
  tools: string[];
};
