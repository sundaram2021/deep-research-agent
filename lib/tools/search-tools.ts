import { tool } from "@langchain/core/tools";
import { z } from "zod";
import Exa from "exa-js";

const exa = () => new Exa(process.env.EXA_API_KEY || "mock-key");

export const search_exa = tool(async ({ query, limit = 5 }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK SEARCH RESULT for "${query}"]: Mock result list.`;
  const res = await exa().search(query, { numResults: limit });
  return JSON.stringify(res.results);
}, { name: "search_exa", description: "Search Exa for links", schema: z.object({ query: z.string(), limit: z.number().optional() }) });

export const get_content_exa = tool(async ({ urls }) => {
  if (!process.env.EXA_API_KEY) return urls.map(u => `[MOCK CONTENT for ${u}]: page content.`).join("\n");
  const res = await exa().getContents(urls);
  return JSON.stringify(res.results);
}, { name: "get_content_exa", description: "Fetch page contents", schema: z.object({ urls: z.array(z.string()) }) });

export const find_similar_exa = tool(async ({ url, limit = 5 }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK SIMILAR to ${url}]`;
  const res = await exa().findSimilar(url, { numResults: limit });
  return JSON.stringify(res.results);
}, { name: "find_similar_exa", description: "Find similar links", schema: z.object({ url: z.string(), limit: z.number().optional() }) });

export const search_news = tool(async ({ query }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK NEWS for "${query}"]`;
  const res = await exa().search(query, { category: "news", numResults: 3 });
  return JSON.stringify(res.results);
}, { name: "search_news", description: "Search news articles", schema: z.object({ query: z.string() }) });

export const search_code = tool(async ({ query }) => {
  return `[CODE SEARCH for "${query}"]: code example.`;
}, { name: "search_code", description: "Search code snippet", schema: z.object({ query: z.string() }) });

export const search_academic = tool(async ({ query }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK ACADEMIC for "${query}"]`;
  const res = await exa().search(query, { category: "research paper", numResults: 3 });
  return JSON.stringify(res.results);
}, { name: "search_academic", description: "Search academic papers", schema: z.object({ query: z.string() }) });

export const search_by_domain = tool(async ({ query, domain }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK SEARCH in ${domain} for "${query}"]`;
  const res = await exa().search(query, { includeDomains: [domain], numResults: 3 });
  return JSON.stringify(res.results);
}, { name: "search_by_domain", description: "Search domain", schema: z.object({ query: z.string(), domain: z.string() }) });

export const search_by_date = tool(async ({ query, startDate }) => {
  if (!process.env.EXA_API_KEY) return `[MOCK SEARCH since ${startDate} for "${query}"]`;
  const res = await exa().search(query, { startPublishedDate: startDate, numResults: 3 });
  return JSON.stringify(res.results);
}, { name: "search_by_date", description: "Search by date", schema: z.object({ query: z.string(), startDate: z.string() }) });

export const validate_url = tool(async ({ url }) => {
  try {
    new URL(url);
    return JSON.stringify({ valid: true, url });
  } catch {
    return JSON.stringify({ valid: false, error: "Invalid format" });
  }
}, { name: "validate_url", description: "Validate a URL structure", schema: z.object({ url: z.string() }) });

export const extract_links = tool(async ({ html }) => {
  const matches = [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/g)];
  return JSON.stringify(matches.map(m => m[1]).slice(0, 10));
}, { name: "extract_links", description: "Extract links from HTML string", schema: z.object({ html: z.string() }) });

export const fetch_rss = tool(async ({ url }) => {
  return JSON.stringify({ url, items: [{ title: "Mock RSS Title", link: url + "/1" }] });
}, { name: "fetch_rss", description: "Fetch RSS feeds", schema: z.object({ url: z.string() }) });

export const get_domain_rank = tool(async ({ domain }) => {
  return JSON.stringify({ domain, rank: Math.floor(Math.random() * 100) + 1 });
}, { name: "get_domain_rank", description: "Get mock domain ranking", schema: z.object({ domain: z.string() }) });

export const list_search_engines = tool(async () => {
  return JSON.stringify(["exa", "google-mock", "academic-mock"]);
}, { name: "list_search_engines", description: "List search engines available", schema: z.object({}) });

export const searchTools = [
  search_exa, get_content_exa, find_similar_exa, search_news, search_code,
  search_academic, search_by_domain, search_by_date, validate_url,
  extract_links, fetch_rss, get_domain_rank, list_search_engines
];
