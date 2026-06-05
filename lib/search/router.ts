// Routes a search/extract across configured providers in priority order, with
// automatic fallback: try the primary; on error OR empty results, try the next.

import { TavilyProvider } from "./tavily-provider";
import { ExaProvider } from "./exa-provider";
import type { ExtractResult, SearchOptions, SearchProvider, SearchResult } from "./types";

export class SearchRouter {
  private readonly providers: SearchProvider[];

  // Default priority: Tavily (purpose-built agent search + extract) first, then
  // Exa (neural). Pass explicit providers in tests.
  constructor(providers?: SearchProvider[]) {
    this.providers = providers ?? [new TavilyProvider(), new ExaProvider()];
  }

  providerNames(): string[] {
    return this.providers.map((p) => p.name);
  }

  hasConfiguredProvider(): boolean {
    return this.providers.some((p) => p.isConfigured());
  }

  private active(): SearchProvider[] {
    return this.providers.filter((p) => p.isConfigured());
  }

  async search(
    query: string,
    options?: SearchOptions
  ): Promise<{ provider: string; results: SearchResult[] }> {
    let lastError: unknown;
    for (const provider of this.active()) {
      try {
        const results = await provider.search(query, options);
        if (results.length > 0) return { provider: provider.name, results };
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError) throw lastError;
    return { provider: "none", results: [] };
  }

  async extract(urls: string[]): Promise<{ provider: string; results: ExtractResult[] }> {
    let lastError: unknown;
    for (const provider of this.active()) {
      if (!provider.extract) continue;
      try {
        const results = await provider.extract(urls);
        if (results.length > 0) return { provider: provider.name, results };
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError) throw lastError;
    return { provider: "none", results: [] };
  }
}

let cached: SearchRouter | null = null;

export function getSearchRouter(): SearchRouter {
  if (!cached) cached = new SearchRouter();
  return cached;
}
