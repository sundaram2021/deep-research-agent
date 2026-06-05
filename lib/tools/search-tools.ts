import { tool } from "@langchain/core/tools";
import { z } from "zod";
import Exa from "exa-js";
import { withRetry } from "../utils/network-helpers";
import { SearchError } from "../utils/typed-errors";
import { currentSourcePool } from "../agents/source-pool";
import { getSearchRouter } from "../search/router";
import { cacheGet, cacheSet } from "../cache/redis-cache";

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

// Search with a per-request shared cache: identical queries across subagents in
// the same research run are served from the pool instead of re-billing Exa.
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
    const res = await exa().search(query, { numResults: limit });
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
      const res = await withRetry(() => exa().getContents(missing), { retries: 3 });
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
    const res = await exa().findSimilar(url, { numResults: limit });
    return JSON.stringify(res.results);
  });
}, { name: "find_similar_exa", description: "Find pages semantically similar to a URL.", schema: z.object({ url: z.string(), limit: z.number().default(5) }) });

export const search_news = tool(async ({ query }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK NEWS for "${query}"]`;
  return cachedSearch(`exa:news:${query}`, "search_news", async () => {
    const res = await exa().search(query, { category: "news", numResults: 3 });
    return JSON.stringify(res.results);
  });
}, { name: "search_news", description: "Search recent news articles.", schema: z.object({ query: z.string() }) });

export const search_code = tool(async ({ query }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK CODE SEARCH for "${query}"]`;
  return cachedSearch(`exa:code:${query}`, "search_code", async () => {
    const res = await exa().search(`${query} code example`, {
      numResults: 5,
      includeDomains: ["github.com", "stackoverflow.com", "gitlab.com", "developer.mozilla.org"],
    });
    return JSON.stringify(res.results);
  });
}, { name: "search_code", description: "Find code examples on GitHub, StackOverflow, GitLab, and MDN.", schema: z.object({ query: z.string() }) });

export const search_academic = tool(async ({ query }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK ACADEMIC for "${query}"]`;
  return cachedSearch(`exa:academic:${query}`, "search_academic", async () => {
    const res = await exa().search(query, { category: "research paper", numResults: 3 });
    return JSON.stringify(res.results);
  });
}, { name: "search_academic", description: "Search academic and research papers.", schema: z.object({ query: z.string() }) });

export const search_by_domain = tool(async ({ query, domain }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK SEARCH in ${domain} for "${query}"]`;
  return cachedSearch(`exa:domain:${domain}:${query}`, "search_by_domain", async () => {
    const res = await exa().search(query, { includeDomains: [domain], numResults: 3 });
    return JSON.stringify(res.results);
  });
}, { name: "search_by_domain", description: "Search within a specific domain.", schema: z.object({ query: z.string(), domain: z.string() }) });

export const search_by_date = tool(async ({ query, startDate }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK SEARCH since ${startDate} for "${query}"]`;
  return cachedSearch(`exa:date:${startDate}:${query}`, "search_by_date", async () => {
    const res = await exa().search(query, { startPublishedDate: startDate, numResults: 3 });
    return JSON.stringify(res.results);
  });
}, { name: "search_by_date", description: "Search for pages published on/after a start date (ISO 8601).", schema: z.object({ query: z.string(), startDate: z.string() }) });

export const validate_url = tool(async ({ url }) => {
  try {
    new URL(url);
    return JSON.stringify({ valid: true, url });
  } catch {
    return JSON.stringify({ valid: false, error: "Invalid format" });
  }
}, { name: "validate_url", description: "Validate a URL structure.", schema: z.object({ url: z.string() }) });

export const extract_links = tool(async ({ html }) => {
  const matches = [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/g)];
  return JSON.stringify([...new Set(matches.map(m => m[1]))].slice(0, 25));
}, { name: "extract_links", description: "Extract unique http(s) links from an HTML string.", schema: z.object({ html: z.string() }) });

function firstMatch(block: string, re: RegExp, group = 1): string {
  const m = block.match(re);
  return m ? (m[group] ?? "").trim() : "";
}

function cleanFeedText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

function parseFeedItems(xml: string): { title: string; link: string; pubDate: string }[] {
  const blocks = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  return blocks.map((block) => {
    const title = cleanFeedText(firstMatch(block, /<title[^>]*>([\s\S]*?)<\/title>/i));
    let link = cleanFeedText(firstMatch(block, /<link[^>]*>([\s\S]*?)<\/link>/i));
    if (!link) link = firstMatch(block, /<link[^>]*href=["']([^"']+)["']/i); // Atom
    const pubDate = cleanFeedText(
      firstMatch(block, /<(?:pubDate|updated|published)[^>]*>([\s\S]*?)<\/(?:pubDate|updated|published)>/i)
    );
    return { title, link, pubDate };
  });
}

export const fetch_rss = tool(async ({ url }) => {
  const pool = currentSourcePool();
  const cacheKey = `rss:${url}`;
  const cached = pool?.getSearch(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const xml = await withRetry(async () => {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "deep-research-agent/1.0",
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        },
      });
      if (!res.ok) throw new SearchError(`RSS fetch failed: HTTP ${res.status}`);
      return res.text();
    });
    const items = parseFeedItems(xml).slice(0, 15);
    const result = JSON.stringify({ url, count: items.length, items });
    pool?.setSearch(cacheKey, result);
    return result;
  } catch (err) {
    return `Error: fetch_rss failed for ${url} (${err instanceof Error ? err.message : String(err)})`;
  }
}, { name: "fetch_rss", description: "Fetch and parse an RSS or Atom feed into {title, link, pubDate} items.", schema: z.object({ url: z.string() }) });

// Provider-routed primary tools: prefer these. They route Tavily -> Exa with
// automatic fallback and share the per-request source pool for dedup.
export const web_search = tool(async ({ query, limit = 5, topic = "general" }) => {
  const router = getSearchRouter();
  if (!router.hasConfiguredProvider()) {
    return `[MOCK web_search for "${query}"]: no provider configured (set TAVILY_API_KEY or EXA_API_KEY).`;
  }
  const key = `web:${topic}:${limit}:${query}`;
  const pool = currentSourcePool();
  const l1 = pool?.getSearch(key); // in-run cache
  if (l1 !== undefined) return l1;
  const l2 = await cacheGet("web-search", key); // cross-run Redis cache
  if (l2 !== null) {
    pool?.setSearch(key, l2);
    return l2;
  }
  try {
    const { provider, results } = await router.search(query, { limit, topic });
    if (results.length === 0) return `No results for "${query}".`;
    const out = JSON.stringify({ provider, results });
    pool?.setSearch(key, out);
    await cacheSet("web-search", key, out);
    return out;
  } catch (err) {
    return `Error: web_search failed (${err instanceof Error ? err.message : String(err)})`;
  }
}, { name: "web_search", description: "Primary web search. Auto-routes to the best configured provider (Tavily, then Exa) with fallback. Returns {provider, results:[{title,url,content,score}]}.", schema: z.object({ query: z.string(), limit: z.number().default(5), topic: z.enum(["general", "news"]).default("general") }) });

export const web_extract = tool(async ({ urls }) => {
  const router = getSearchRouter();
  if (!router.hasConfiguredProvider()) {
    return urls.map((u) => `[MOCK web_extract for ${u}]: no provider configured.`).join("\n");
  }
  const pool = currentSourcePool();
  const out: { url: string; content: string }[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    const l1 = pool?.getContent(`web:${url}`); // in-run cache
    if (l1 !== undefined) {
      out.push({ url, content: l1 });
      continue;
    }
    const l2 = await cacheGet("web-content", url); // cross-run Redis cache
    if (l2 !== null) {
      pool?.setContent(`web:${url}`, l2);
      out.push({ url, content: l2 });
      continue;
    }
    missing.push(url);
  }
  if (missing.length > 0) {
    try {
      const { results } = await router.extract(missing);
      for (const r of results) {
        if (r.url) {
          pool?.setContent(`web:${r.url}`, r.content);
          await cacheSet("web-content", r.url, r.content);
        }
        out.push(r);
      }
    } catch (err) {
      return `Error: web_extract failed for ${missing.length} url(s) (${err instanceof Error ? err.message : String(err)})`;
    }
  }
  return JSON.stringify(out);
}, { name: "web_extract", description: "Fetch clean page content for URLs via the best provider (Tavily extract, then Exa), deduplicated per research run.", schema: z.object({ urls: z.array(z.string()) }) });

export const searchTools = [
  web_search, web_extract,
  search_exa, get_content_exa, find_similar_exa, search_news, search_code,
  search_academic, search_by_domain, search_by_date, validate_url,
  extract_links, fetch_rss,
];
