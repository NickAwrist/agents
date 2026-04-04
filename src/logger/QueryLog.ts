import type { AgentRuntimeObserver } from "./RuntimeObserver";
import { AgentRunLog } from "./trace";

export type QueryLogOptions = {
  sessionId?: string;
  /** Live hooks (tools, turns, LLM). Use composeRuntimeObservers to combine sinks. */
  runtimeObserver?: AgentRuntimeObserver;
};

export class QueryLog {
  readonly queryId: string;
  readonly userQuery: string;
  readonly sessionId?: string;
  private readonly runtimeObserver?: AgentRuntimeObserver;
  private readonly startTime: Date;
  private endTime: Date;
  private response = "";
  rootRun: AgentRunLog | null = null;

  constructor(userQuery: string, options?: QueryLogOptions) {
    this.queryId = crypto.randomUUID();
    this.userQuery = userQuery;
    this.sessionId = options?.sessionId;
    this.runtimeObserver = options?.runtimeObserver;
    this.startTime = new Date();
    this.endTime = this.startTime;
  }

  /** Pass `runtimeObserver` to override the one from constructor (e.g. file sink created after `queryId` exists). */
  beginRootAgent(agentName: string, runtimeObserver?: AgentRuntimeObserver): AgentRunLog {
    const run = new AgentRunLog({
      queryId: this.queryId,
      userQuery: this.userQuery,
      path: agentName,
      agentName,
      observer: runtimeObserver ?? this.runtimeObserver,
    });
    this.rootRun = run;
    return run;
  }

  end(response: string): void {
    this.endTime = new Date();
    this.response = response;
  }

  getResponse(): string {
    return this.response;
  }

  toJSON(maxResultChars?: number): Record<string, unknown> {
    return {
      queryId: this.queryId,
      userQuery: this.userQuery,
      sessionId: this.sessionId,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime.toISOString(),
      response: this.response,
      rootRun: this.rootRun?.toJSON(maxResultChars),
    };
  }
}
