import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getModelPair } from "../../models";
import { getSearchRouter } from "../../search/router";
import { withRetry } from "../../utils/network-helpers";

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
