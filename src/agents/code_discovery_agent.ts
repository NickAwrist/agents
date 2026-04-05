import { ListFilesTool } from "../tools/list_files";
import { BaseAgent } from "./BaseAgent";
import { ReadFileTool } from "../tools/read_file";
import { ModifyPlan } from "../tools/modify_plan";
import { GrepTool } from "../tools/grep";

export class CodeDiscoveryAgent extends BaseAgent {
  constructor() {
    super(
      'CodeDiscoveryAgent',
      'An agent that helps find where a certain functionality is located in the codebase. If you do now know where a particular feature is, instead of listing all the files and reading each, just call this tool.',
    );
    this.initTools();
    this.initSystemPrompt();
  }

  private initTools(): void {
    this.addTools([new ListFilesTool(), new ReadFileTool(), new ModifyPlan(), new GrepTool()]);
  }

  private initSystemPrompt(): void {
    this.systemPrompt =
      `
    You are an expert code discovery agent. Your primary goal is to help users locate specific functionality, classes, methods, or logic within a codebase.
    
    Your process should generally be:
    1. Use 'list_files' to understand the overall project structure.
    2. Use 'grep' to search for keywords, function names, or strings related to the functionality.
    3. Use 'read_file' to examine the contents of promising files and confirm if they contain the target functionality.
    4. Use 'modify_plan' to track your search progress and refine your strategy.

    When you find the functionality, provide the exact file path and the line numbers or code snippet where it is located. Be thorough and explain why you believe this is the correct location.

    CRITICAL RULES FOR TOOL USAGE:
    1. ALWAYS use the full path from the project root when reading or searching files.
    2. If a search returns too many results, refine your grep pattern or use list_files to narrow down the directory.
    `;
  }
}
