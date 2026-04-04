import { QueryLog } from "./QueryLog";

export class SessionLog {
  readonly sessionId: string;
  private readonly queryLogs: QueryLog[] = [];
  private readonly startTime: Date;

  constructor() {
    this.sessionId = crypto.randomUUID();
    this.startTime = new Date();
  }

  addQueryLog(queryLog: QueryLog): void {
    this.queryLogs.push(queryLog);
  }

  getQueryLogs(): QueryLog[] {
    return this.queryLogs;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  toJSON(maxResultChars?: number): Record<string, unknown> {
    return {
      sessionId: this.sessionId,
      startTime: this.startTime.toISOString(),
      queries: this.queryLogs.map((q) => q.toJSON(maxResultChars)),
    };
  }
}
