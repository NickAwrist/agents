import type { MessageStep } from "../../types";

function startCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAgentName(name?: string) {
  if (!name) return null;
  if (name === "general_agent") return "Main agent";
  if (name === "coding_agent") return "Coding agent";
  if (name === "computer_agent") return "Computer agent";
  if (name === "code_discovery_agent") return "Code discovery agent";
  return startCase(name);
}

export function getLiveStepMeta(
  step: MessageStep | null,
  count: number,
  streamingContent: string,
) {
  const isResponding = streamingContent.trim().length > 0;

  if (!step) {
    return {
      label: "Running",
      detail: `${count} step${count === 1 ? "" : "s"}`,
    };
  }

  const toolName = step.toolName ? startCase(step.toolName) : null;
  const agentName = formatAgentName(step.agentName);
  const isSubagentTool = step.kind === "tool_call" && step.toolName?.endsWith("_agent");

  if (isSubagentTool) {
    return {
      label: "Agent",
      detail: toolName,
    };
  }

  if (step.kind === "tool_call") {
    return {
      label: "Tool",
      detail: toolName,
    };
  }

  if (step.kind === "llm_call" && agentName && step.agentName !== "general_agent") {
    return {
      label: "Agent",
      detail: agentName,
    };
  }

  if (step.kind === "complete") {
    return {
      label: "Writing",
      detail: null,
    };
  }

  if (step.kind === "error") {
    return {
      label: "Error",
      detail: null,
    };
  }

  return {
    label: isResponding ? "Responding" : "Thinking",
    detail: agentName && step.agentName !== "general_agent" ? agentName : null,
  };
}
