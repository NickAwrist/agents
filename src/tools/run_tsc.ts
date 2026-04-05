import { BaseTool } from "./BaseTool";
import type { Tool } from "ollama";
import type { RunContext } from "../RunContext";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class RunTscTool extends BaseTool {
  constructor() {
    super('run_tsc', 'Run the typescript compiler to check for type errors.');
  }

  override toTool(): Tool {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    };
  }

  override async execute(args: Record<string, unknown>, ctx?: RunContext): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync("npx tsc --noEmit");
      let output = stdout || stderr;
      if (output.trim() === "") {
         return "No type errors found! Compilation successful.";
      }
      return output;
    } catch (error: any) {
      // exec throws if tsc exits with a non-zero code (errors found)
      let output = error.stdout || error.stderr || error.message;
      return output.trim() ? output : "Error running tsc (no output)";
    }
  }
}
