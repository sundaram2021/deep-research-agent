import { tool } from "@langchain/core/tools";
import { z } from "zod";
import vm from "node:vm";
import { getModelPair } from "../models";
import { getEmbedder, cosineSimilarity } from "../agents/embeddings";
import { getSearchRouter } from "../search/router";
import { withRetry } from "../utils/network-helpers";

// Verify a claim against its cited source: fetch the page, then check entailment
// with a cheap model. Guards against fabricated or unsupported citations.
export const verify_citation = tool(async ({ claim, sourceUrl }) => {
  let content = "";
  try {
    const { results } = await getSearchRouter().extract([sourceUrl]);
    content = results[0]?.content ?? "";
  } catch (err) {
    return JSON.stringify({ supported: false, confidence: 0, quote: "", error: err instanceof Error ? err.message : String(err) });
  }
  if (!content) return JSON.stringify({ supported: false, confidence: 0, quote: "", error: "no content fetched" });
  const schema = z.object({
    supported: z.boolean(),
    confidence: z.number().min(0).max(1),
    quote: z.string(),
  });
  try {
    const res = await withRetry(() =>
      getModelPair().extractor.withStructuredOutput(schema, { name: "CitationCheck" }).invoke([
        {
          role: "system",
          content:
            "Decide whether the SOURCE supports the CLAIM. Use only the source text, not outside knowledge. If supported, quote the exact supporting sentence; otherwise quote = \"\".",
        },
        { role: "user", content: `CLAIM: ${claim}\n\nSOURCE (${sourceUrl}):\n${content.slice(0, 8000)}` },
      ])
    );
    return JSON.stringify(res);
  } catch {
    return JSON.stringify({ supported: false, confidence: 0, quote: "", error: "verification model call failed" });
  }
}, { name: "verify_citation", description: "Verify that a cited source actually supports a claim. Fetches the URL and checks entailment. Returns {supported, confidence, quote}.", schema: z.object({ claim: z.string(), sourceUrl: z.string() }) });

// Real LLM summarization (preserves facts/numbers/entities) — unlike text_truncate.
export const summarize_text = tool(async ({ text, maxWords = 120 }) => {
  try {
    const res = await withRetry(() =>
      getModelPair().extractor.invoke([
        {
          role: "system",
          content: `Summarize the text in at most ${maxWords} words. Preserve key facts, numbers, and named entities. Output only the summary.`,
        },
        { role: "user", content: text.slice(0, 16000) },
      ])
    );
    return typeof res.content === "string" ? res.content : String(res.content);
  } catch (err) {
    return `Error: summarize_text failed (${err instanceof Error ? err.message : String(err)})`;
  }
}, { name: "summarize_text", description: "Summarize text with an LLM, preserving facts, numbers, and entities. A real summary (use this, not text_truncate).", schema: z.object({ text: z.string(), maxWords: z.number().default(120) }) });

// Rank candidate snippets by semantic relevance to a query (embeddings).
export const rank_by_relevance = tool(async ({ query, candidates }) => {
  if (candidates.length === 0) return "[]";
  try {
    const embedder = getEmbedder();
    const q = await embedder.embedQuery(query);
    const vecs = await embedder.embedDocuments(candidates);
    const ranked = candidates
      .map((text, i) => ({ text, score: Number(cosineSimilarity(q, vecs[i]).toFixed(4)) }))
      .sort((a, b) => b.score - a.score);
    return JSON.stringify(ranked);
  } catch (err) {
    return `Error: rank_by_relevance failed (${err instanceof Error ? err.message : String(err)})`;
  }
}, { name: "rank_by_relevance", description: "Rank candidate snippets by semantic relevance to a query using embeddings. Returns [{text, score}] sorted desc.", schema: z.object({ query: z.string(), candidates: z.array(z.string()) }) });

// Remove near-duplicate texts via embedding cosine similarity.
export const semantic_dedup = tool(async ({ texts, threshold = 0.92 }) => {
  if (texts.length <= 1) return JSON.stringify({ unique: texts, removed: [] });
  try {
    const vecs = await getEmbedder().embedDocuments(texts);
    const dup = new Set<number>();
    for (let i = 0; i < texts.length; i++) {
      if (dup.has(i)) continue;
      for (let j = i + 1; j < texts.length; j++) {
        if (dup.has(j)) continue;
        if (cosineSimilarity(vecs[i], vecs[j]) >= threshold) dup.add(j);
      }
    }
    return JSON.stringify({
      unique: texts.filter((_, i) => !dup.has(i)),
      removed: texts.filter((_, i) => dup.has(i)),
    });
  } catch (err) {
    return `Error: semantic_dedup failed (${err instanceof Error ? err.message : String(err)})`;
  }
}, { name: "semantic_dedup", description: "Remove near-duplicate texts using embedding cosine similarity (default threshold 0.92). Returns {unique, removed}.", schema: z.object({ texts: z.array(z.string()), threshold: z.number().default(0.92) }) });

// Sandboxed JS for quantitative analysis on provided data. No I/O, no require,
// 1s timeout. NOTE: node:vm is not a hardened security boundary — intended for
// computing over the provided `data`, not running untrusted arbitrary code.
export const code_exec = tool(async ({ code, dataJson = "" }) => {
  let data: unknown;
  if (dataJson) {
    try {
      data = JSON.parse(dataJson);
    } catch {
      return "Error: dataJson is not valid JSON";
    }
  }
  const sandbox: Record<string, unknown> = { data, Math, JSON, result: undefined, console: { log: () => {} } };
  try {
    const script = new vm.Script(`"use strict"; result = (function () { ${code}\n })();`);
    script.runInContext(vm.createContext(sandbox), { timeout: 1000 });
    const out = sandbox.result;
    return typeof out === "string" ? out : JSON.stringify(out ?? null);
  } catch (err) {
    return `Error: code_exec failed (${err instanceof Error ? err.message : String(err)})`;
  }
}, { name: "code_exec", description: "Run a short JS snippet for data analysis on `data` (parsed from dataJson). Sandboxed: no I/O or require, 1s timeout. Return your output from the snippet.", schema: z.object({ code: z.string(), dataJson: z.string().default("") }) });

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// Fetch a YouTube video's English captions (no dependency; public timedtext API).
export const youtube_transcript = tool(async ({ url }) => {
  const idMatch = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  if (!idMatch) return "Error: could not parse a YouTube video id from the URL";
  const videoId = idMatch[1];
  try {
    const res = await fetch(`https://video.google.com/timedtext?lang=en&v=${videoId}`);
    const xml = await res.text();
    const segs = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decodeEntities(m[1]));
    if (segs.length === 0) {
      return JSON.stringify({ videoId, transcript: "", note: "No English transcript available (captions may be disabled)." });
    }
    return JSON.stringify({ videoId, transcript: segs.join(" ").replace(/\s+/g, " ").trim() });
  } catch (err) {
    return `Error: youtube_transcript failed (${err instanceof Error ? err.message : String(err)})`;
  }
}, { name: "youtube_transcript", description: "Fetch the English transcript/captions of a YouTube video by URL. Returns {videoId, transcript}.", schema: z.object({ url: z.string() }) });

export const knowledgeTools = [
  verify_citation,
  summarize_text,
  rank_by_relevance,
  semantic_dedup,
  code_exec,
  youtube_transcript,
];
