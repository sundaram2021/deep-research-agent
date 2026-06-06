import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { withRetry } from "../../utils/network-helpers";
import { SearchError } from "../../utils/typed-errors";
import { currentSourcePool } from "../../agents/source-pool";

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
