// Lightweight in-memory vector store for semantic memory over fetched content:
// embed once, then cosine-rank or find near-duplicates. No external vector DB.

import { getEmbedder, cosineSimilarity } from "../agents/embeddings";

export interface VectorItem<M = unknown> {
  id: string;
  text: string;
  embedding: number[];
  metadata?: M;
}

export class InMemoryVectorStore<M = unknown> {
  private items: VectorItem<M>[] = [];

  async add(entries: { id?: string; text: string; metadata?: M }[]): Promise<void> {
    if (entries.length === 0) return;
    const vectors = await getEmbedder().embedDocuments(entries.map((e) => e.text));
    entries.forEach((e, i) => {
      this.items.push({
        id: e.id ?? crypto.randomUUID(),
        text: e.text,
        embedding: vectors[i],
        metadata: e.metadata,
      });
    });
  }

  async search(query: string, k = 5): Promise<Array<{ item: VectorItem<M>; score: number }>> {
    if (this.items.length === 0) return [];
    const q = await getEmbedder().embedQuery(query);
    return this.items
      .map((item) => ({ item, score: cosineSimilarity(q, item.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  size(): number {
    return this.items.length;
  }
}

// Pure helper (no network): given embeddings, return the indices of near-duplicate
// entries (the later of each similar pair). Testable in isolation.
export function findDuplicateIndices(vectors: number[][], threshold = 0.92): number[] {
  const dup = new Set<number>();
  for (let i = 0; i < vectors.length; i++) {
    if (dup.has(i)) continue;
    for (let j = i + 1; j < vectors.length; j++) {
      if (dup.has(j)) continue;
      if (cosineSimilarity(vectors[i], vectors[j]) >= threshold) dup.add(j);
    }
  }
  return [...dup].sort((a, b) => a - b);
}
