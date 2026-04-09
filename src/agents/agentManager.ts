import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { BaseAgent } from './BaseAgent';
import { CreateFileTool } from "../tools/create_file";
import { DeleteFileTool } from "../tools/delete_file";
import { GrepTool } from "../tools/grep";
import { ListFilesTool } from "../tools/list_files";
import { ModifyPlan } from "../tools/modify_plan";
import { ReadFileTool } from "../tools/read_file";
import { RunTscTool } from "../tools/run_tsc";
import { WebSearchTool } from "../tools/web_search";
import { BashTool } from "../tools/bash";
import type { BaseTool } from '../tools/BaseTool';
import type { RunContext } from '../RunContext';
import { AgentTool } from '../tools/AgentTool';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const agentsJsonPath = path.join(__dirname, 'agents.json');
const agentsData = JSON.parse(fs.readFileSync(agentsJsonPath, 'utf8'));

export const agentManager = {
  /** Subagents inherit the parent agent's Ollama model when `ctx` is provided. */
  createAgentForContext(agentName: string, ctx?: RunContext): BaseAgent {
    const agent = this.createAgent(agentName);
    const parentModel = ctx?.agentInstance?.model;
    if (typeof parentModel === "string" && parentModel.length > 0) {
      agent.model = parentModel;
    }
    return agent;
  },

  createAgent(agentName: string): BaseAgent {
    const config = agentsData.agents.find((a: any) => a.name === agentName);
    if (!config) {
      throw new Error(`Agent configuration for '${agentName}' not found in agents.json`);
    }

    // BaseAgent constructor: name, description, tools?, model?, systemPrompt?
    const agent = new BaseAgent(config.name, config.description, undefined, undefined, config.system_prompt);

    if (config.tools && Array.isArray(config.tools)) {
      const tools = config.tools.map((t: string) => this.getToolInstance(t));
      agent.addTools(tools);
    }

    return agent;
  },

  getToolInstance(toolName: string): BaseTool {

    if (toolName.endsWith('_agent')) {
      return new AgentTool(toolName, agentsData.agents.find((a: any) => a.name === toolName)?.description);
    }

    switch (toolName) { 
      case 'create_file': return new CreateFileTool();
      case 'delete_file': return new DeleteFileTool();
      case 'grep': return new GrepTool();
      case 'list_files': return new ListFilesTool();
      case 'modify_plan': return new ModifyPlan();
      case 'read_file': return new ReadFileTool();
      case 'run_tsc': return new RunTscTool();
      case 'web_search': return new WebSearchTool();
      case 'bash': return new BashTool();
      default: throw new Error(`Unknown tool: ${toolName}`);
    }
  }
};
