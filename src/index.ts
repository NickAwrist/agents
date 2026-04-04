import { GeneralAgent } from "./agents/general_agent";
import { getDefaultQueryLogDir, persistQueryLog } from "./logger/persistQueryLog";
import { QueryLog } from "./logger/QueryLog";
import { composeRuntimeObservers, createConsoleRuntimeObserver } from "./logger/RuntimeObserver";
import { createStreamingFileRuntimeObserver } from "./logger/streamingFileObserver";
import { SessionLog } from "./logger/SessionLog";

const EXIT_COMMANDS = new Set(["/bye", "/quit", "/exit"]);
const PROMPT = "\n[You]: ";

function wantConsoleRuntime(): boolean {
  return process.env.AGENT_RUNTIME_LOG !== "0";
}

function wantStreamFile(): boolean {
  return process.env.AGENT_RUNTIME_STREAM_LOG !== "0";
}

async function main(): Promise<void> {
  console.log(
    `[Type /bye, /quit, or /exit to quit] · final JSON → ${getDefaultQueryLogDir()}/*.json · live stream → same folder/*.stream.ndjson (AGENT_RUNTIME_STREAM_LOG=0 disables)`,
  );

  const generalAgent = new GeneralAgent();
  const session = new SessionLog();

  process.stdout.write(PROMPT);
  for await (const line of console) {
    if (EXIT_COMMANDS.has(line)) {
      console.log("\n[GeneralAgent]: Goodbye!");
      break;
    }

    const queryLog = new QueryLog(line, { sessionId: session.getSessionId() });
    session.addQueryLog(queryLog);

    const stream = wantStreamFile() ? createStreamingFileRuntimeObserver(queryLog.queryId) : null;
    const consoleObs = wantConsoleRuntime() ? createConsoleRuntimeObserver() : undefined;
    const runtimeObserver = stream
      ? composeRuntimeObservers(stream.observer, consoleObs)
      : consoleObs;

    if (stream) {
      console.log(`[trace] live stream → ${stream.streamPath}`);
    }

    const rootRun = queryLog.beginRootAgent("GeneralAgent", runtimeObserver);

    let response: string | null = null;
    try {
      response = await generalAgent.run(line, rootRun);
      queryLog.end(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      queryLog.end(`[error] ${msg}`);
      console.error("\n[GeneralAgent error]", err);
    } finally {
      try {
        const jsonPath = await persistQueryLog(queryLog);
        console.log(`[trace] final JSON → ${jsonPath}`);
      } catch (e) {
        console.error("[trace] JSON write failed:", e);
      }
    }

    if (response !== null) {
      console.log("\n[GeneralAgent]: " + response);
    }
    if (process.env.DEBUG_TRACE) {
      console.log(JSON.stringify(queryLog.toJSON(), null, 2));
    }
    process.stdout.write(PROMPT);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
