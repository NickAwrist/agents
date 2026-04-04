

export class ToolLog {
  private toolName: string;
  private toolResult: string;
  private toolStartTime: Date;
  private toolEndTime: Date;

  constructor(toolName: string) {
    this.toolName = toolName;
    this.toolResult = '';
    this.toolStartTime = new Date();
    this.toolEndTime = new Date();
  }
  
  end(result: string): void {
    this.toolResult = result;
    this.toolEndTime = new Date();
  }

  getResult(): string {
    return this.toolResult;
  }
}