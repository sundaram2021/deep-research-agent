import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { currentSourcePool } from "../../agents/source-pool";
import { getSearchRouter } from "../../search/router";
import { cacheGet, cacheSet } from "../../cache/redis-cache";

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
