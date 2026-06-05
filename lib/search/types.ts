// Provider-agnostic search/extract contracts. Concrete providers (Tavily, Exa,
// future: Brave, Wikipedia, Semantic Scholar) implement this so the router can
// pick the best available one and fall back automatically.

export interface SearchResult {
  title: string;
  url: string;
  content: string; // snippet or summary
  score?: number; // relevance 0..1 when the provider supplies it
  publishedDate?: string;
}

export interface SearchOptions {
  limit?: number;
  topic?: "general" | "news";
  includeDomains?: string[];
  startDate?: string; // ISO 8601 "published after"
}

export interface ExtractResult {
  url: string;
  content: string;
}

export interface SearchProvider {
  readonly name: string;
  isConfigured(): boolean;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  extract?(urls: string[]): Promise<ExtractResult[]>;
}
