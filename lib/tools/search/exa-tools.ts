import { tool } from "@langchain/core/tools";
import { z } from "zod";
import Exa from "exa-js";
import { withRetry } from "../../utils/network-helpers";
import { exaLimiter } from "../../utils/rate-limiters";
import { currentSourcePool } from "../../agents/source-pool";

const exa = () => new Exa(process.env.EXA_API_KEY || "mock-key");

// Wrap an Exa call with retry/backoff and graceful, non-throwing output so a
// transient provider hiccup degrades to a message instead of aborting the run.
async function withExaRetry(label: string, fn: () => Promise<string>): Promise<string> {
  try {
    return await withRetry(fn, { retries: 3 });
  } catch (err) {
    return `Error: ${label} failed after retries (${err instanceof Error ? err.message : String(err)})`;
  }
}

// Per-request shared cache: identical queries across subagents in the same run
// are served from the pool instead of re-billing Exa.
async function cachedSearch(key: string, label: string, fn: () => Promise<string>): Promise<string> {
  const pool = currentSourcePool();
  const cached = pool?.getSearch(key);
  if (cached !== undefined) return cached;
  const result = await withExaRetry(label, fn);
  if (pool && !result.startsWith("Error:")) pool.setSearch(key, result);
  return result;
}

export const search_exa = tool(async ({ query, limit = 5 }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK SEARCH RESULT for "${query}"]: Mock result list.`;
  return cachedSearch(`exa:search:${limit}:${query}`, "search_exa", async () => {
    const res = await exaLimiter().schedule(() => exa().search(query, { numResults: limit }));
    return JSON.stringify(res.results);
  });
}, { name: "search_exa", description: "Search the web via Exa and return ranked links.", schema: z.object({ query: z.string(), limit: z.number().default(5) }) });

// Fetch page contents with per-URL dedup: a page fetched by one subagent is
// reused by the others in the same run, so each unique URL is fetched once.
export const get_content_exa = tool(async ({ urls }) => {
  if (!process.env.EXA_API_KEY) return urls.map(u => `[MOCK CONTENT for ${u}]: page content.`).join("\n");
  const pool = currentSourcePool();
  const out: unknown[] = [];
  const missing: string[] = [];
  const missingSet = new Set<string>();
  for (const url of urls) {
    const hit = pool?.getContent(url);
    if (hit !== undefined) {
      try { out.push(JSON.parse(hit)); } catch { out.push({ url, text: hit }); }
    } else if (!missingSet.has(url)) {
      missing.push(url);
      missingSet.add(url);
    }
  }
  if (missing.length > 0) {
    try {
      const res = await withRetry(() => exaLimiter().schedule(() => exa().getContents(missing)), { retries: 3 });
      for (const r of res.results) {
        const url = (r as { url?: string }).url ?? "";
        if (url) pool?.setContent(url, JSON.stringify(r));
        out.push(r);
      }
    } catch (err) {
      return `Error: get_content_exa failed for ${missing.length} uncached url(s) (${err instanceof Error ? err.message : String(err)})`;
    }
  }
  return JSON.stringify(out);
}, { name: "get_content_exa", description: "Fetch the full text content of one or more URLs (deduplicated per research run).", schema: z.object({ urls: z.array(z.string()) }) });

export const find_similar_exa = tool(async ({ url, limit = 5 }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK SIMILAR to ${url}]`;
  return cachedSearch(`exa:similar:${limit}:${url}`, "find_similar_exa", async () => {
    const res = await exaLimiter().schedule(() => exa().findSimilar(url, { numResults: limit }));
    return JSON.stringify(res.results);
  });
}, { name: "find_similar_exa", description: "Find pages semantically similar to a URL.", schema: z.object({ url: z.string(), limit: z.number().default(5) }) });

export const search_news = tool(async ({ query }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK NEWS for "${query}"]`;
  return cachedSearch(`exa:news:${query}`, "search_news", async () => {
    const res = await exaLimiter().schedule(() => exa().search(query, { category: "news", numResults: 3 }));
    return JSON.stringify(res.results);
  });
}, { name: "search_news", description: "Search recent news articles.", schema: z.object({ query: z.string() }) });

export const search_code = tool(async ({ query }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK CODE SEARCH for "${query}"]`;
  return cachedSearch(`exa:code:${query}`, "search_code", async () => {
    const res = await exaLimiter().schedule(() => exa().search(`${query} code example`, {
      numResults: 5,
      includeDomains: ["github.com", "stackoverflow.com", "gitlab.com", "developer.mozilla.org"],
    }));
    return JSON.stringify(res.results);
  });
}, { name: "search_code", description: "Find code examples on GitHub, StackOverflow, GitLab, and MDN.", schema: z.object({ query: z.string() }) });

export const search_academic = tool(async ({ query }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK ACADEMIC for "${query}"]`;
  return cachedSearch(`exa:academic:${query}`, "search_academic", async () => {
    const res = await exaLimiter().schedule(() => exa().search(query, { category: "research paper", numResults: 3 }));
    return JSON.stringify(res.results);
  });
}, { name: "search_academic", description: "Search academic and research papers.", schema: z.object({ query: z.string() }) });

export const search_by_domain = tool(async ({ query, domain }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK SEARCH in ${domain} for "${query}"]`;
  return cachedSearch(`exa:domain:${domain}:${query}`, "search_by_domain", async () => {
    const res = await exaLimiter().schedule(() => exa().search(query, { includeDomains: [domain], numResults: 3 }));
    return JSON.stringify(res.results);
  });
}, { name: "search_by_domain", description: "Search within a specific domain.", schema: z.object({ query: z.string(), domain: z.string() }) });

export const search_by_date = tool(async ({ query, startDate }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK SEARCH since ${startDate} for "${query}"]`;
  return cachedSearch(`exa:date:${startDate}:${query}`, "search_by_date", async () => {
    const res = await exaLimiter().schedule(() => exa().search(query, { startPublishedDate: startDate, numResults: 3 }));
    return JSON.stringify(res.results);
  });
}, { name: "search_by_date", description: "Search for pages published on/after a start date (ISO 8601).", schema: z.object({ query: z.string(), startDate: z.string() }) });
