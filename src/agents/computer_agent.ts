import { ListFilesTool } from "../tools/list_files";
import { BaseAgent } from "./BaseAgent";
import { CreateFileTool } from "../tools/create_file";
import { ReadFileTool } from "../tools/read_file";


export class ComputerAgent extends BaseAgent {
  constructor() {
    super('ComputerAgent', 'A computer agent that can perform tasks that require a computer.');
    this.initTools();
    this.initSystemPrompt();
  }

  private initTools(): void  {
    this.addTools([new ListFilesTool(), new CreateFileTool(), new ReadFileTool()]);
  }

  private initSystemPrompt(): void {
    this.systemPrompt = 
    `
    You are a computer agent that can perform tasks that require a computer. You are to complete the task to the best of your ability given the tools available to you.
    Your response is to another AI agent, so be concise and to the point.
    `;
  }
}