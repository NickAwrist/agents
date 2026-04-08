import { BaseTool } from "./BaseTool";
import type { Tool } from "ollama";
import type { RunContext } from "../RunContext";
import { exec } from "child_process";
import { loadGitignore, filterOutputLines } from "../utils/gitignoreFilter";

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

    const signal = ctx?.signal;
    if (signal?.aborted) return "[command aborted]";

    try {
      const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = exec(command, (error, stdout, stderr) => {
          if (error) {
            reject(Object.assign(error, { stdout, stderr }));
          } else {
            resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
          }
        });

        if (signal) {
          const onAbort = () => {
            child.kill("SIGTERM");
            reject(new Error("Command aborted"));
          };
          if (signal.aborted) {
            onAbort();
          } else {
            signal.addEventListener("abort", onAbort, { once: true });
          }
        }
      });

      let output = "";
      if (stdout) {
        const ig = await loadGitignore();
        const { filtered, removedCount } = filterOutputLines(stdout, ig);
        output += filtered;
        if (removedCount > 0) {
          output += `\n[${removedCount} gitignored entries hidden]`;
        }
      }
      if (stderr) {
        output += "\n--- stderr ---\n" + stderr;
      }
      return output || "Command executed successfully with no output.";
    } catch (error: any) {
      if (signal?.aborted) return "[command aborted]";
      let output = error.stdout || error.stderr || error.message;
      return `Error executing command: ${output}`;
    }
  }
}
