import type { BaseTool } from "../tools/BaseTool";
import ollama, { type ChatResponse, type ToolCall } from "ollama";

export class BaseAgent {
  model: string;
  systemPrompt?: string;
  name: string;
  description: string;
  tools: BaseTool[];
  history: Array<{ role: string; content: string }>;

  TOOL_MAP: Record<string, BaseTool>;

  constructor(name: string, description: string, tools?: BaseTool[], model?: string, systemPrompt?: string) {
    this.name = name;
    this.description = description;

    this.tools = tools || [];
    this.model = model || 'gemma4:31b';
    this.systemPrompt = systemPrompt;

    this.history = [];

    this.TOOL_MAP = {};
  }

  addTool(tool: BaseTool): void {
    console.log(`[DEBUG-${this.name}]: Adding tool ${tool.name}`);
    if (this.TOOL_MAP[tool.name]) {
      throw new Error(`Tool ${tool.name} already added`);
    }
    this.TOOL_MAP[tool.name] = tool;
    this.tools.push(tool);
  }

  addTools(tools: BaseTool[]): void {
    for (const tool of tools) {
      this.addTool(tool);
    }
  }

  private async executeToolCall(toolCall: ToolCall): Promise<string> {
    let toolName = toolCall.function.name;
    const tool = this.TOOL_MAP[toolName];
    if (!tool) {
      return 'Error: tool ' + toolName + ' not found';
    }
    console.log(`[DEBUG-${this.name}]: Executing tool ${toolName}`);
    const result = await tool.execute(this.parseToolArguments(toolCall.function.arguments));
    console.log(`[DEBUG-${this.name}]: Tool result: ${result}`);
    return result;
  }

  private parseToolArguments(raw: unknown): Record<string, unknown> {
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        /* ignore */
      }
      return {};
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return {};
  }

  async run(prompt: string): Promise<string> {
    var systemPrompt: { role: string; content: string } | undefined;
    if (this.systemPrompt) {
      systemPrompt = { role: 'system', content: this.systemPrompt };
    }
      
    let response: ChatResponse;
    do {
      console.log(`[DEBUG-${this.name}]: Running agent with prompt: ${prompt}`);

      response = await ollama.chat({
        model: this.model,
        messages: [
          systemPrompt || { role: 'system', content: '' },
          ...this.history,
          { role: 'user', content: prompt },
        ],
        tools: this.tools.map(tool => tool.toTool()),
      });
      this.history.push({ role: 'user', content: prompt });
      if (response.message.tool_calls) {
        console.log(`[DEBUG-${this.name}]: Tool calls: ${JSON.stringify(response.message.tool_calls, null, 2)}`);
        
        var toolResults: { role: string; content: string }[] = [];
        for (const toolCall of response.message.tool_calls) {
          const result = await this.executeToolCall(toolCall);
          toolResults.push({ role: 'assistant', content: `Result from tool call ${toolCall.function.name}: ${result}` });
        }
        prompt = toolResults.map(result => result.content).join('\n');
      }
    } while(response.message.tool_calls);

    this.history.push({ role: 'assistant', content: response.message.content });
    return response.message.content;
  }
}