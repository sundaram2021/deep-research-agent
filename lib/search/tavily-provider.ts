// Tavily provider — purpose-built agent search + extraction over its REST API.
// Uses raw fetch (no SDK dependency). Auth is sent both as a Bearer header and
// as an api_key body field to support either Tavily auth style.

import { withRetry } from "../utils/network-helpers";
import { tavilyLimiter } from "../utils/rate-limiters";
import { RateLimitError, SearchError } from "../utils/typed-errors";
import type { ExtractResult, SearchOptions, SearchProvider, SearchResult } from "./types";

const SEARCH_URL = "https://api.tavily.com/search";
const EXTRACT_URL = "https://api.tavily.com/extract";

interface TavilySearchRaw {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    raw_content?: string;
    score?: number;
    published_date?: string;
  }>;
}

interface TavilyExtractRaw {
  results?: Array<{ url?: string; raw_content?: string; content?: string }>;
}

export class TavilyProvider implements SearchProvider {
  readonly name = "tavily";
  private readonly apiKey: string;

  constructor(apiKey: string = process.env.TAVILY_API_KEY ?? "") {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const data = await this.post<TavilySearchRaw>(SEARCH_URL, "tavily.search", {
      query,
      search_depth: "advanced",
      max_results: options.limit ?? 5,
      topic: options.topic ?? "general",
      include_domains: options.includeDomains,
      start_date: options.startDate,
    });
    return (data.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? r.raw_content ?? "",
      score: r.score,
      publishedDate: r.published_date,
    }));
  }

  async extract(urls: string[]): Promise<ExtractResult[]> {
    if (urls.length === 0) return [];
    const data = await this.post<TavilyExtractRaw>(EXTRACT_URL, "tavily.extract", { urls });
    return (data.results ?? []).map((r) => ({
      url: r.url ?? "",
      content: r.raw_content ?? r.content ?? "",
    }));
  }

  private async post<T>(url: string, label: string, body: Record<string, unknown>): Promise<T> {
    return withRetry(async () => {
      const res = await tavilyLimiter().schedule(() =>
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({ api_key: this.apiKey, ...body }),
        })
      );
      if (res.status === 429) throw new RateLimitError(`${label} rate limited`);
      if (!res.ok) throw new SearchError(`${label} failed: HTTP ${res.status}`);
      return (await res.json()) as T;
    });
  }
}
