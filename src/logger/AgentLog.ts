import type { ToolLog } from "./ToolLog";


export class AgentLog {
  private agentName: string;
  private query: string;
  private response: string;
  private startTime: Date;
  private endTime: Date;

  private history: Array<{ role: string; content: string }> = [];
  private toolLogs: ToolLog[] = []; 
  constructor(agentName: string, query: string) {
    this.agentName = agentName;
    this.query = query;
    this.response = '';
    this.startTime = new Date();
    this.endTime = new Date();
    this.history = [];
  }

  end(response: string, history: Array<{ role: string; content: string }>): void {
    this.response = response;
    this.endTime = new Date();
    this.history = history;
  }

  getResponse(): string {
    return this.response;
  }

  addToolLog(toolLog: ToolLog): void {
    this.toolLogs.push(toolLog);
  }
}