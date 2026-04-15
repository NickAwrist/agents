export type AgentData = {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  include_personalization: number;
  include_session_directory: number;
  include_os_info: number;
  is_default: number;
  tools: string[];
  created_at: number;
  updated_at: number;
};

export async function fetchAgents(): Promise<AgentData[]> {
  const res = await fetch("/api/agents");
  if (!res.ok) throw new Error("Failed to fetch agents");
  const data = await res.json();
  return data.agents;
}

export async function fetchAgent(id: string): Promise<AgentData> {
  const res = await fetch(`/api/agents/${id}`);
  if (!res.ok) throw new Error("Failed to fetch agent");
  return res.json();
}

export async function createAgentApi(body: {
  name: string;
  description: string;
  system_prompt: string;
  tools: string[];
  include_personalization: number;
  include_session_directory: number;
  include_os_info: number;
}): Promise<AgentData> {
  const res = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create agent");
  }
  return res.json();
}

export async function updateAgentApi(
  id: string,
  body: {
    name: string;
    description: string;
    system_prompt: string;
    tools: string[];
    include_personalization: number;
    include_session_directory: number;
    include_os_info: number;
  },
): Promise<void> {
  const res = await fetch(`/api/agents/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update agent");
  }
}

export async function deleteAgentApi(id: string): Promise<void> {
  const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete agent");
  }
}

export async function fetchBuiltinTools(): Promise<string[]> {
  const res = await fetch("/api/tools");
  if (!res.ok) throw new Error("Failed to fetch tools");
  const data = await res.json();
  return data.tools;
}

export async function fetchDefaultChatAgent(): Promise<string> {
  const res = await fetch("/api/settings/default-chat-agent");
  if (!res.ok) throw new Error("Failed to fetch default agent");
  const data = await res.json();
  return typeof data.agentName === "string" ? data.agentName : "general_agent";
}

export async function putDefaultChatAgentApi(agentName: string): Promise<string> {
  const res = await fetch("/api/settings/default-chat-agent", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update default agent");
  }
  const data = await res.json();
  return typeof data.agentName === "string" ? data.agentName : agentName;
}
