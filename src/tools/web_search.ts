import type { Tool } from "ollama";
import { parse as parseHtml } from "node-html-parser";
import { BaseTool } from "./BaseTool";

const DUCKDUCKGO_URL = "https://html.duckduckgo.com/html/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export class WebSearchTool extends BaseTool {
  constructor() {
    super(
      "web_search",
      "Search the web using DuckDuckGo HTML scraping (100% free, no API keys needed).",
    );
  }

  override toTool(): Tool {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", description: "The search query string." },
            max_results: {
              type: "number",
              description: "Maximum results to return (default 5, max 10).",
            },
          },
        },
      },
    };
  }

  override async execute(args: Record<string, unknown>): Promise<string> {
    if (typeof args.query !== "string" || args.query.trim().length === 0) {
      return "Error: query must be a non-empty string";
    }

    const maxResults =
      typeof args.max_results === "number" ? Math.min(Math.max(1, args.max_results), 10) : 5;

    try {
      const res = await fetch(DUCKDUCKGO_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: `q=${encodeURIComponent(args.query)}`,
      });

      if (!res.ok) {
        return `Error: DuckDuckGo returned status ${res.status}`;
      }

      const html = await res.text();
      const results = parseDuckDuckGoResults(html, maxResults);

      if (results.length === 0) {
        return "No results found.";
      }

      return results
        .map((r, i) => {
          const parts = [`Result ${i + 1} (${r.title}):`];
          if (r.url) parts.push(r.url);
          parts.push(r.snippet);
          return parts.join("\n");
        })
        .join("\n\n---\n\n");
    } catch (e: unknown) {
      return `Error performing web search: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}

type SearchResult = { title: string; url: string; snippet: string };

function parseDuckDuckGoResults(html: string, maxResults: number): SearchResult[] {
  const root = parseHtml(html);
  const nodes = root.querySelectorAll(".result");
  const out: SearchResult[] = [];

  for (const node of nodes) {
    if (out.length >= maxResults) break;

    const titleAnchor = node.querySelector(".result__title a") ?? node.querySelector("h2 a");
    if (!titleAnchor) continue;

    const title = titleAnchor.text.trim();
    if (!title) continue;

    const snippetNode = node.querySelector(".result__snippet");
    const snippet = snippetNode?.text.trim() || "No description available.";

    const url = extractDuckDuckGoUrl(titleAnchor.getAttribute("href") ?? "");

    out.push({ title, url, snippet });
  }

  return out;
}

/**
 * DuckDuckGo wraps result links in `//duckduckgo.com/l/?uddg=<encoded>&rut=...`.
 * Extract the real target URL, or return the original if it isn't wrapped.
 */
function extractDuckDuckGoUrl(href: string): string {
  if (!href) return "";
  try {
    const normalized = href.startsWith("//") ? `https:${href}` : href;
    const u = new URL(normalized, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : u.toString();
  } catch {
    return href;
  }
}
