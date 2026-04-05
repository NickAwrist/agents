import { ListFilesTool } from "../tools/list_files";
import { BaseAgent } from "./BaseAgent";
import { CreateFileTool } from "../tools/create_file";
import { ReadFileTool } from "../tools/read_file";
import { DeleteFileTool } from "../tools/delete_file";


export class ComputerAgent extends BaseAgent {
  constructor() {
    super('ComputerAgent', 'A computer agent that can perform tasks that require a computer. When calling this subagent, you must provide the expected result you desire from the task.');
    this.initTools();
    this.initSystemPrompt();
  }

  private initTools(): void {
    this.addTools([new ListFilesTool(), new CreateFileTool(), new ReadFileTool(), new DeleteFileTool()]);
  }

  private initSystemPrompt(): void {
    this.systemPrompt =
      `
    You are a computer agent that can perform tasks that require a computer. You are to complete the task to the best of your ability given the tools available to you.
    Your response is to another AI agent. CRITICAL: If your task involves reading files, listing directories, or retrieving any information, you MUST include the actual, full contents or results in your final response. Do NOT summarize or just state that you have completed the read; the requesting agent needs the actual data to proceed.
    `;
  }
}
