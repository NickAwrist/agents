import type { Tool } from "ollama";
import { BaseTool } from "./BaseTool";

export class WebSearchTool extends BaseTool {
  constructor() {
    super('web_search', 'Search the web using DuckDuckGo HTML scraping (100% free, no API keys needed).');
  }

  override toTool(): Tool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', description: 'The search query string.' },
            max_results: { type: 'number', description: 'Maximum results to return (default 5, max 10).' },
          },
        },
      },
    };
  }

  override async execute(args: Record<string, unknown>): Promise<string> {
    if (typeof args.query !== 'string' || args.query.trim().length === 0) {
      return 'Error: query must be a non-empty string';
    }
    
    const maxResults = typeof args.max_results === 'number' ? Math.min(args.max_results, 10) : 5;
    
    try {
      const res = await fetch("https://html.duckduckgo.com/html/", {
        method: "POST",
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded", 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" 
        },
        body: `q=${encodeURIComponent(args.query)}`
      });

      if (!res.ok) {
        return `Error: DuckDuckGo returned status ${res.status}`;
      }

      const text = await res.text();
      
      // Extract titles and snippets purely via regex to avoid bloated DOM parser dependencies
      const snippets = [...text.matchAll(/<a class="result__snippet[^>]+>(.*?)<\/a>/g)].map(m => m[1]);
      const titles = [...text.matchAll(/<h2 class="result__title">[\s\S]*?<a[^>]+>(.*?)<\/a>[\s\S]*?<\/h2>/g)].map(m => m[1]);

      if (titles.length === 0) {
        return "No results found.";
      }

      const results: string[] = [];
      const decodeHtml = (html: string) => {
        return html
          .replace(/&#x27;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/<\/?[^>]+(>|$)/g, ""); // Strip leftover tags
      };

      for (let i = 0; i < Math.min(maxResults, titles.length); i++) {
        const titleRaw = titles[i] || "";
        const snippetRaw = snippets[i] || "";
        
        const title = decodeHtml(titleRaw);
        const snippet = snippetRaw ? decodeHtml(snippetRaw) : "No description available.";
        results.push(`Result ${i + 1} (${title}):\n${snippet}`);
      }

      return results.join('\n\n---\n\n');
    } catch (e: unknown) {
      return `Error performing web search: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}
