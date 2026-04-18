/**
 * Runs a shell command in the session working directory.
 * On Windows the shell is `cmd.exe` (not bash); POSIX uses `/bin/sh` or similar via `shell: true`.
 */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import type { Tool } from "ollama";
import type { RunContext } from "../RunContext";
import { filterOutputLines, loadGitignore } from "../utils/gitignoreFilter";
import { BaseTool } from "./BaseTool";

const DEFAULT_MAX_BUFFER = 2 * 1024 * 1024;

export class BashTool extends BaseTool {
  constructor() {
    super(
      "bash",
      "Execute a bash command in the terminal and return the output.",
    );
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

  override async execute(
    args: Record<string, unknown>,
    ctx?: RunContext,
  ): Promise<string> {
    const command = args.command as string;
    if (!command) {
      return "Error: No command provided.";
    }

    const signal = ctx?.signal;
    if (signal?.aborted) return "[command aborted]";

    const cwd = ctx?.sessionDir?.trim() || homedir();

    try {
      const { stdout, stderr, truncated } = await runShellSpawn(
        command,
        cwd,
        signal,
        DEFAULT_MAX_BUFFER,
      );

      let output = "";
      if (stdout) {
        const ig = await loadGitignore(cwd);
        const { filtered, removedCount } = filterOutputLines(stdout, ig, cwd);
        output += filtered;
        if (removedCount > 0) {
          output += `\n[${removedCount} gitignored entries hidden]`;
        }
      }
      if (stderr) {
        output += `\n--- stderr ---\n${stderr}`;
      }
      if (truncated) {
        output += `\n[output truncated at ${DEFAULT_MAX_BUFFER} bytes]`;
      }
      return output || "Command executed successfully with no output.";
    } catch (error: unknown) {
      if (signal?.aborted) return "[command aborted]";
      const err = error as {
        stdout?: string;
        stderr?: string;
        message?: string;
      };
      const out = err.stdout || err.stderr || err.message;
      return `Error executing command: ${out}`;
    }
  }
}

function runShellSpawn(
  command: string,
  cwd: string,
  signal: AbortSignal | undefined,
  maxBuffer: number,
): Promise<{ stdout: string; stderr: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;

    const append = (prev: string, chunk: Buffer): string => {
      const next = prev + chunk.toString();
      if (next.length > maxBuffer) {
        truncated = true;
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
        return next.slice(0, maxBuffer);
      }
      return next;
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    let abortHandler: (() => void) | undefined;
    if (signal) {
      abortHandler = () => {
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
        reject(Object.assign(new Error("Command aborted"), { stdout, stderr }));
      };
      if (signal.aborted) {
        abortHandler();
      } else {
        signal.addEventListener("abort", abortHandler, { once: true });
      }
    }

    child.on("error", (err) => {
      if (signal && abortHandler)
        signal.removeEventListener("abort", abortHandler);
      reject(err);
    });

    child.on("close", (_code, _sig) => {
      if (signal && abortHandler)
        signal.removeEventListener("abort", abortHandler);
      resolve({ stdout, stderr, truncated });
    });
  });
}
