import type { AgentData } from "../../persist/agents";
import type { AgentEditorState } from "./types";

export const PROTECTED_AGENT_NAME = "general_agent";

export function canDeleteAgent(a: AgentData): boolean {
  return a.name !== PROTECTED_AGENT_NAME;
}

export function emptyEditor(): AgentEditorState {
  return {
    name: "",
    description: "",
    system_prompt: "",
    include_personalization: 1,
    include_session_directory: 0,
    include_os_info: 0,
    tools: [],
  };
}

export function editorFromAgent(a: AgentData): AgentEditorState {
  return {
    name: a.name,
    description: a.description,
    system_prompt: a.system_prompt,
    include_personalization: a.include_personalization,
    include_session_directory: a.include_session_directory ?? 0,
    include_os_info: a.include_os_info ?? 0,
    tools: [...a.tools],
  };
}

/** Stable compare; tool order does not affect equality. */
export function editorsEqual(a: AgentEditorState, b: AgentEditorState): boolean {
  if (
    a.name !== b.name ||
    a.description !== b.description ||
    a.system_prompt !== b.system_prompt ||
    a.include_personalization !== b.include_personalization ||
    a.include_session_directory !== b.include_session_directory ||
    a.include_os_info !== b.include_os_info
  ) {
    return false;
  }
  const sa = [...a.tools].sort();
  const sb = [...b.tools].sort();
  if (sa.length !== sb.length) return false;
  return sa.every((t, i) => t === sb[i]);
}
