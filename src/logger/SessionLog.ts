import { QueryLog } from "./QueryLog";

export class SessionLog {
  private sessionId = crypto.randomUUID();
  private queryLogs: QueryLog[] = [];
  private startTime: Date;

  constructor() {
    this.sessionId = crypto.randomUUID();
    this.queryLogs = [];
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
}