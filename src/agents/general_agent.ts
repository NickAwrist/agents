import { BaseAgent } from "./BaseAgent";
import { SoftwareEngAgentTool } from "../tools/software_eng_agent";
import { WebSearchTool } from "../tools/web_search";

export class GeneralAgent extends BaseAgent {
  constructor() {
    super('GeneralAgent', 'A general agent that can answer general queries or call agents to perform tasks.');
    this.initTools();
  }

  private initTools(): void {
    this.addTools([new SoftwareEngAgentTool(), new WebSearchTool()]);
  }
}