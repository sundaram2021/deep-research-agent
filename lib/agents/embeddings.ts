// Shared OpenAI embeddings client + cosine similarity, used for relevance
// ranking and near-duplicate detection over fetched content.

import { OpenAIEmbeddings } from "@langchain/openai";

let cached: OpenAIEmbeddings | null = null;

export function getEmbedder(): OpenAIEmbeddings {
  if (!cached) {
    cached = new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY || "missing-key",
      model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
    });
  }
  return cached;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
