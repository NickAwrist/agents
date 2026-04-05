import { BaseTool } from "./BaseTool";
import type { Tool } from "ollama";
import type { RunContext } from "../RunContext";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class BashTool extends BaseTool {
  constructor() {
    super('bash', 'Execute a bash command in the terminal and return the output.');
  }

  override toTool(): Tool {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The bash command to execute.",
            },
          },
          required: ["command"],
        },
      },
    };
  }

  override async execute(args: Record<string, unknown>, ctx?: RunContext): Promise<string> {
    const command = args.command as string;
    if (!command) {
      return "Error: No command provided.";
    }

    try {
      const { stdout, stderr } = await execAsync(command);
      let output = "";
      if (stdout) {
        output += stdout;
      }
      if (stderr) {
        output += "\n--- stderr ---\n" + stderr;
      }
      return output || "Command executed successfully with no output.";
    } catch (error: any) {
      let output = error.stdout || error.stderr || error.message;
      return `Error executing command: ${output}`;
    }
  }
}
