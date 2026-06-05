// Exa provider — neural/embedding search and content fetch. Wraps exa-js behind
// the shared SearchProvider contract so the router can fall back to it.

import Exa from "exa-js";
import { withRetry } from "../utils/network-helpers";
import type { ExtractResult, SearchOptions, SearchProvider, SearchResult } from "./types";

type ExaResultRow = {
  title?: string;
  url?: string;
  text?: string;
  summary?: string;
  score?: number;
  publishedDate?: string;
};

export class ExaProvider implements SearchProvider {
  readonly name = "exa";
  private readonly apiKey: string;

  constructor(apiKey: string = process.env.EXA_API_KEY ?? "") {
    this.apiKey = apiKey;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  private client() {
    return new Exa(this.apiKey || "mock-key");
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    return withRetry(async () => {
      const opts: Record<string, unknown> = { numResults: options.limit ?? 5 };
      if (options.topic === "news") opts.category = "news";
      if (options.includeDomains?.length) opts.includeDomains = options.includeDomains;
      if (options.startDate) opts.startPublishedDate = options.startDate;
      const res = await this.client().search(query, opts);
      const rows = (res.results ?? []) as unknown as ExaResultRow[];
      return rows.map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        content: r.text ?? r.summary ?? "",
        score: r.score,
        publishedDate: r.publishedDate,
      }));
    });
  }

  async extract(urls: string[]): Promise<ExtractResult[]> {
    if (urls.length === 0) return [];
    return withRetry(async () => {
      const res = await this.client().getContents(urls);
      const rows = (res.results ?? []) as unknown as ExaResultRow[];
      return rows.map((r) => ({ url: r.url ?? "", content: r.text ?? "" }));
    });
  }
}
