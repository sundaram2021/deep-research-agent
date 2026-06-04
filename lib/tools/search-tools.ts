import { tool } from "@langchain/core/tools";
import { z } from "zod";
import Exa from "exa-js";
import { withRetry } from "../utils/network-helpers";
import { SearchError } from "../utils/typed-errors";

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

export const search_exa = tool(async ({ query, limit = 5 }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK SEARCH RESULT for "${query}"]: Mock result list.`;
  return withExaRetry("search_exa", async () => {
    const res = await exa().search(query, { numResults: limit });
    return JSON.stringify(res.results);
  });
}, { name: "search_exa", description: "Search the web via Exa and return ranked links.", schema: z.object({ query: z.string(), limit: z.number().default(5) }) });

export const get_content_exa = tool(async ({ urls }) => {
  if (!process.env.EXA_API_KEY) return urls.map(u => `[MOCK CONTENT for ${u}]: page content.`).join("\n");
  return withExaRetry("get_content_exa", async () => {
    const res = await exa().getContents(urls);
    return JSON.stringify(res.results);
  });
}, { name: "get_content_exa", description: "Fetch the full text content of one or more URLs.", schema: z.object({ urls: z.array(z.string()) }) });

export const find_similar_exa = tool(async ({ url, limit = 5 }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK SIMILAR to ${url}]`;
  return withExaRetry("find_similar_exa", async () => {
    const res = await exa().findSimilar(url, { numResults: limit });
    return JSON.stringify(res.results);
  });
}, { name: "find_similar_exa", description: "Find pages semantically similar to a URL.", schema: z.object({ url: z.string(), limit: z.number().default(5) }) });

export const search_news = tool(async ({ query }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK NEWS for "${query}"]`;
  return withExaRetry("search_news", async () => {
    const res = await exa().search(query, { category: "news", numResults: 3 });
    return JSON.stringify(res.results);
  });
}, { name: "search_news", description: "Search recent news articles.", schema: z.object({ query: z.string() }) });

export const search_code = tool(async ({ query }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK CODE SEARCH for "${query}"]`;
  return withExaRetry("search_code", async () => {
    const res = await exa().search(`${query} code example`, {
      numResults: 5,
      includeDomains: ["github.com", "stackoverflow.com", "gitlab.com", "developer.mozilla.org"],
    });
    return JSON.stringify(res.results);
  });
}, { name: "search_code", description: "Find code examples on GitHub, StackOverflow, GitLab, and MDN.", schema: z.object({ query: z.string() }) });

export const search_academic = tool(async ({ query }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK ACADEMIC for "${query}"]`;
  return withExaRetry("search_academic", async () => {
    const res = await exa().search(query, { category: "research paper", numResults: 3 });
    return JSON.stringify(res.results);
  });
}, { name: "search_academic", description: "Search academic and research papers.", schema: z.object({ query: z.string() }) });

export const search_by_domain = tool(async ({ query, domain }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK SEARCH in ${domain} for "${query}"]`;
  return withExaRetry("search_by_domain", async () => {
    const res = await exa().search(query, { includeDomains: [domain], numResults: 3 });
    return JSON.stringify(res.results);
  });
}, { name: "search_by_domain", description: "Search within a specific domain.", schema: z.object({ query: z.string(), domain: z.string() }) });

export const search_by_date = tool(async ({ query, startDate }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK SEARCH since ${startDate} for "${query}"]`;
  return withExaRetry("search_by_date", async () => {
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
    return JSON.stringify({ url, count: items.length, items });
  } catch (err) {
    return `Error: fetch_rss failed for ${url} (${err instanceof Error ? err.message : String(err)})`;
  }
}, { name: "fetch_rss", description: "Fetch and parse an RSS or Atom feed into {title, link, pubDate} items.", schema: z.object({ url: z.string() }) });

export const searchTools = [
  search_exa, get_content_exa, find_similar_exa, search_news, search_code,
  search_academic, search_by_domain, search_by_date, validate_url,
  extract_links, fetch_rss,
];
