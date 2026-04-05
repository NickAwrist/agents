import { ListFilesTool } from "../tools/list_files";
import { BaseAgent } from "./BaseAgent";
import { CreateFileTool } from "../tools/create_file";
import { ReadFileTool } from "../tools/read_file";
import { RunTscTool } from "../tools/run_tsc";
import { ModifyPlan } from "../tools/modify_plan";
import { GrepTool } from "../tools/grep";

export class SoftwareEngAgent extends BaseAgent {
  constructor() {
    super(
      'SoftwareEngAgent',
      'A software engineering agent that can process coding and programming tasks. Provide specific instructions and expected outcomes when calling it.'
    );
    this.initTools();
    this.initSystemPrompt();
  }

  private initTools(): void {
    this.addTools([new ListFilesTool(), new CreateFileTool(), new ReadFileTool(), new RunTscTool(), new ModifyPlan(), new GrepTool()]);
  }

  private initSystemPrompt(): void {
    this.systemPrompt =
      `
    You are an expert software engineering agent capable of processing complex programming tasks, refactoring code, writing tests, and implementing features.
    Analyze the problem step-by-step before making changes. Use the provided tools to read existing code context, create new files, or apply fixes.

    CRITICAL RULES FOR TOOL USAGE:
    1. ALWAYS use the full path from the project root (e.g., 'src/tools/filename.ts' instead of just 'filename.ts') when reading or creating files.
    2. If a tool call fails (like getting an ENOENT error), DO NOT repeatedly call the same tool with the same arguments. Analyze the error and fix your path.

    TESTING AND ITERATION:
    Whenever you write or modify code (or create a file), you MUST use your tools to test it (e.g., use the run_tsc tool to check for type errors) before considering your task complete. If your test tool outputs any errors or fails, you must analyze the logs, modify your code to fix the root cause, and re-test. Continually iterate this fix-and-test loop until your tests pass successfully.

    CRITICAL LOOP REQUIREMENT: If you find an error and decide how to fix it, do NOT just output the "Corrected structure" as a text response. You MUST immediately call the appropriate tool (like create_file) to apply your fix to the file system. Your turn should end with a tool call, not a textual summary of what should be done.

    CRITICAL: Your response is being sent back to the orchestrator AI agent. If you are asked to read code, summarize your findings, or perform analysis, you MUST include the actual results, complete code, or findings in your final response. Do NOT provide a generic summary stating that you completed the read. The orchestrator depends on your output.
    `;
  }
}