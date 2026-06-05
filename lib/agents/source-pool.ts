// Per-request shared source pool. Subagents running for the same research
// request share one pool (via AsyncLocalStorage) so a page fetched or a query
// run by one subagent is reused by the others instead of being paid for twice.

import { AsyncLocalStorage } from "node:async_hooks";

export class SourcePool {
  private readonly content = new Map<string, string>();
  private readonly searches = new Map<string, string>();
  private contentHits = 0;
  private searchHits = 0;

  getContent(url: string): string | undefined {
    const value = this.content.get(url);
    if (value !== undefined) this.contentHits++;
    return value;
  }

  setContent(url: string, value: string): void {
    if (url) this.content.set(url, value);
  }

  getSearch(key: string): string | undefined {
    const value = this.searches.get(key);
    if (value !== undefined) this.searchHits++;
    return value;
  }

  setSearch(key: string, value: string): void {
    this.searches.set(key, value);
  }

  stats() {
    return {
      uniqueUrls: this.content.size,
      uniqueSearches: this.searches.size,
      contentCacheHits: this.contentHits,
      searchCacheHits: this.searchHits,
    };
  }
}

const storage = new AsyncLocalStorage<SourcePool>();

/** Run `fn` with `pool` as the ambient source pool for all nested async work. */
export function withSourcePool<T>(pool: SourcePool, fn: () => Promise<T>): Promise<T> {
  return storage.run(pool, fn);
}

/** The source pool for the current request, if any (undefined outside a run). */
export function currentSourcePool(): SourcePool | undefined {
  return storage.getStore();
}
