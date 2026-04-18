import { exec } from "node:child_process";
import { homedir } from "node:os";
import { promisify } from "node:util";
import type { Tool } from "ollama";
import type { RunContext } from "../RunContext";
import { BaseTool } from "./BaseTool";

const execAsync = promisify(exec);

export class RunTscTool extends BaseTool {
  constructor() {
    super("run_tsc", "Run the typescript compiler to check for type errors.");
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

  override async execute(
    args: Record<string, unknown>,
    ctx?: RunContext,
  ): Promise<string> {
    const cwd = ctx?.sessionDir?.trim() || homedir();
    try {
      const { stdout, stderr } = await execAsync("npx tsc --noEmit", { cwd });
      const output = stdout || stderr;
      if (output.trim() === "") {
        return "No type errors found! Compilation successful.";
      }
      return output;
    } catch (error: unknown) {
      // exec throws if tsc exits with a non-zero code (errors found)
      const e = error as { stdout?: string; stderr?: string; message?: string };
      const output = e.stdout || e.stderr || e.message;
      return output?.trim() ? output : "Error running tsc (no output)";
    }
  }
}
