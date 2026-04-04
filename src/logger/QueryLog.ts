import { AgentLog } from "./AgentLog";

export class QueryLog {
  private query: string;
  private response: string;
  private startTime: Date;
  private endTime: Date;

  private agentLogs: AgentLog[] = [];

  constructor(query: string) {
    this.query = query;
    this.response = '';
    this.startTime = new Date();
    this.endTime = new Date();
  }

  addAgentLog(agentLog: AgentLog): void {
    this.agentLogs.push(agentLog);
  }

  end(response: string): void {
    this.endTime = new Date();
    this.response = response;
  }


  

}