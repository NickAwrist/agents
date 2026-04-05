import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { BaseAgent } from './BaseAgent';
import { CodeDiscoveryAgentTool } from "../tools/code_discovery_agent";
import { ComputerAgentTool } from "../tools/computer_agent";
import { CreateFileTool } from "../tools/create_file";
import { DeleteFileTool } from "../tools/delete_file";
import { GrepTool } from "../tools/grep";
import { ListFilesTool } from "../tools/list_files";
import { ModifyPlan } from "../tools/modify_plan";
import { ReadFileTool } from "../tools/read_file";
import { RunTscTool } from "../tools/run_tsc";
import { SoftwareEngAgentTool } from "../tools/software_eng_agent";
import { WebSearchTool } from "../tools/web_search";
import { BashTool } from "../tools/bash";
import type { BaseTool } from '../tools/BaseTool';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const agentsJsonPath = path.join(__dirname, 'agents.json');
const agentsData = JSON.parse(fs.readFileSync(agentsJsonPath, 'utf8'));

export const agentManager = {
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
    switch (toolName) {
      case 'code_discovery_agent': return new CodeDiscoveryAgentTool();
      case 'computer_agent': return new ComputerAgentTool();
      case 'create_file': return new CreateFileTool();
      case 'delete_file': return new DeleteFileTool();
      case 'grep': return new GrepTool();
      case 'list_files': return new ListFilesTool();
      case 'modify_plan': return new ModifyPlan();
      case 'read_file': return new ReadFileTool();
      case 'run_tsc': return new RunTscTool();
      case 'coding_agent': return new SoftwareEngAgentTool();
      case 'web_search': return new WebSearchTool();
      case 'bash': return new BashTool();
      default: throw new Error(`Unknown tool: ${toolName}`);
    }
  }
};
