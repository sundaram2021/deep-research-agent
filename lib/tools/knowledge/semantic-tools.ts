import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getEmbedder, cosineSimilarity } from "../../agents/embeddings";

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
