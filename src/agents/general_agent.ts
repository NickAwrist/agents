import { BaseAgent } from "./BaseAgent";
import { ComputerAgentTool } from "../tools/computer_agent";

export class GeneralAgent extends BaseAgent {
  constructor() {
    super('GeneralAgent', 'A general agent that can answer general queries or call agents to perform tasks.');
    this.initTools();
  } 

  private initTools(): void {
    this.addTools([new ComputerAgentTool()]);
  }
}