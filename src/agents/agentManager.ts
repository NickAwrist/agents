import os from "node:os";
import type { RunContext } from "../RunContext";
import { DEFAULT_CHAT_MODEL } from "../constants";
import { getAgentByName } from "../db/index";
import {
  type PersonalizationFields,
  type PromptContext,
  renderSystemPrompt,
} from "../prompts/render";
import { AgentTool } from "../tools/AgentTool";
import type { BaseTool } from "../tools/BaseTool";
import { BashTool } from "../tools/bash";
import { CreateFileTool } from "../tools/create_file";
import { DeleteFileTool } from "../tools/delete_file";
import { GenerateImageTool } from "../tools/generate_image";
import { GrepTool } from "../tools/grep";
import { ListFilesTool } from "../tools/list_files";
import { ModifyPlan } from "../tools/modify_plan";
import { ReadFileTool } from "../tools/read_file";
import { RunTscTool } from "../tools/run_tsc";
import { WebSearchTool } from "../tools/web_search";
import { BaseAgent } from "./BaseAgent";

export const BUILTIN_TOOLS = [
  "create_file",
  "delete_file",
  "grep",
  "list_files",
  "modify_plan",
  "read_file",
  "run_tsc",
  "web_search",
  "bash",
  "generate_image",
] as const;

export type CreateAgentOptions = {
  /**
   * Pre-rendered system prompt. When provided it is used verbatim (plus
   * appended core directives). When omitted the stored template is rendered
   * on the server using `promptContext` — used for subagent invocations.
   */
  systemPrompt?: string;
  /** Resolved absolute directory tools use; also drives `{{SESSION_DIRECTORY}}`. */
  toolSessionDir?: string;
  /** Values to fill `{{PLACEHOLDERS}}` when `systemPrompt` is not provided. */
  promptContext?: PromptContext;
};

function serverPromptContext(
  base: PromptContext | undefined,
  toolSessionDir: string | undefined,
): PromptContext {
  return {
    personalization: base?.personalization,
    sessionDirectory: base?.sessionDirectory ?? toolSessionDir,
    os: base?.os ?? `${os.platform()} ${os.arch()} (${os.release()})`,
  };
}

/** PromptContext for chat turns: OS + session dir from server; personalization from request metadata. */
export function buildServerChatPromptContext(opts: {
  metadata?: {
    name?: string | undefined;
    location?: string | undefined;
    preferredFormats?: string | undefined;
  };
  toolSessionDir?: string;
}): PromptContext {
  let personalization: PersonalizationFields | undefined;
  if (opts.metadata !== undefined) {
    const name = opts.metadata.name?.trim();
    const location = opts.metadata.location?.trim();
    const preferredFormats = opts.metadata.preferredFormats?.trim();
    personalization = {};
    if (name) personalization.name = name;
    if (location) personalization.location = location;
    if (preferredFormats) personalization.preferredFormats = preferredFormats;
  }
  return serverPromptContext(
    personalization !== undefined ? { personalization } : {},
    opts.toolSessionDir,
  );
}

export const agentManager = {
  /** Build a subagent that inherits the parent run's prompt context + session dir. */
  createAgentForContext(agentName: string, ctx?: RunContext): BaseAgent {
    const agent = this.createAgent(agentName, {
      toolSessionDir: ctx?.sessionDir,
      promptContext: ctx?.promptContext,
    });
    const parentModel = ctx?.agentInstance?.model;
    if (typeof parentModel === "string" && parentModel.length > 0) {
      agent.model = parentModel;
    } else {
      agent.model = DEFAULT_CHAT_MODEL;
    }
    return agent;
  },

  createAgent(agentName: string, opts?: CreateAgentOptions): BaseAgent {
    const config = getAgentByName(agentName);
    if (!config) {
      throw new Error(
        `Agent configuration for '${agentName}' not found in database`,
      );
    }

    const finalPrompt =
      typeof opts?.systemPrompt === "string" && opts.systemPrompt.length > 0
        ? opts.systemPrompt
        : renderSystemPrompt(
            config.system_prompt,
            serverPromptContext(opts?.promptContext, opts?.toolSessionDir),
          );

    const agent = new BaseAgent(
      config.name,
      config.description,
      undefined,
      undefined,
      finalPrompt,
    );

    if (config.tools.length > 0) {
      const tools = config.tools.map((t: string) => this.getToolInstance(t));
      agent.addTools(tools);
    }

    return agent;
  },

  getToolInstance(toolName: string): BaseTool {
    if (toolName.endsWith("_agent")) {
      const agentRow = getAgentByName(toolName);
      return new AgentTool(toolName, agentRow?.description ?? toolName);
    }

    switch (toolName) {
      case "create_file":
        return new CreateFileTool();
      case "delete_file":
        return new DeleteFileTool();
      case "grep":
        return new GrepTool();
      case "list_files":
        return new ListFilesTool();
      case "modify_plan":
        return new ModifyPlan();
      case "read_file":
        return new ReadFileTool();
      case "run_tsc":
        return new RunTscTool();
      case "web_search":
        return new WebSearchTool();
      case "bash":
        return new BashTool();
      case "generate_image":
        return new GenerateImageTool();
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  },
};
