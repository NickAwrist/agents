import type { AgentData } from "../../persist/agents";
import type { AgentEditorState } from "./types";

export const PROTECTED_AGENT_NAME = "general_agent";

export function canDeleteAgent(a: AgentData): boolean {
  return a.name !== PROTECTED_AGENT_NAME;
}

export function emptyEditor(): AgentEditorState {
  return { name: "", description: "", system_prompt: "", include_personalization: 1, tools: [] };
}

export function editorFromAgent(a: AgentData): AgentEditorState {
  return {
    name: a.name,
    description: a.description,
    system_prompt: a.system_prompt,
    include_personalization: a.include_personalization,
    tools: [...a.tools],
  };
}
