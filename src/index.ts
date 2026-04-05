import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";
import { agentManager } from "./agents/agentManager";
import { RunContext } from "./RunContext";
import { buildRunViewerHtml } from "./runViewerHtml";
import ollama from "ollama";

const EXIT_COMMANDS = new Set(["/bye", "/quit", "/exit"]);
const PROMPT = "\n[You]: ";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNS_DIR = path.join(PROJECT_ROOT, "logs", "runs");

async function main(): Promise<void> {
  try {
    const ollamaVersion = await ollama.version();
    console.log("Powered by ollama v" + ollamaVersion.version)
  } catch (e) {
    console.error("Ollama is unreachable. Is it running?");
    return;
  }
  console.log("[Type /bye, /quit, or /exit to quit]");

  const generalAgent = agentManager.createAgent("general_agent");

  process.stdout.write(PROMPT);
  for await (const line of console) {
    if (EXIT_COMMANDS.has(line)) {
      console.log("\n[GeneralAgent]: Goodbye!");
      break;
    }

    const ctx = new RunContext(generalAgent, line, (ctx, step) => {
      const tag = `[${ctx.agentName}]`;
      const tool = step.toolName ? ` tool=${step.toolName}` : "";
      console.log(`${tag} step ${step.kind} ${step.status}${tool} (turn ${step.turnIndex})`);
      if (step.status === "running" && step.args) {
        console.log(`${tag}   args: ${JSON.stringify(step.args, null, 2)}`);
      }
      if (step.status === "error" && step.error) {
        console.log(`${tag}   error: ${step.error}`);
      }
      if (step.status === "done" && step.result) {
        console.log(`${tag}   result: ${step.result.slice(0, 200)}`);
      }
    });

    let response: string | null = null;
    try {
      response = await generalAgent.run(line, ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.failStep(msg);
      console.error("\n[GeneralAgent error]", err);
    } finally {
      try {
        await fs.mkdir(RUNS_DIR, { recursive: true });
        const html = buildRunViewerHtml(ctx.snapshot());
        const filename = `${Date.now()}.html`;
        await fs.writeFile(path.join(RUNS_DIR, filename), html, "utf8");
      } catch (e) {
        console.error("[run-log] HTML write failed:", e);
      }
    }

    if (response !== null) {
      console.log("\n[GeneralAgent]: " + response);
    }
    process.stdout.write(PROMPT);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
