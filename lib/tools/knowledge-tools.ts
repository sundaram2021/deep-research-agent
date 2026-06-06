// Knowledge tool namespace. Individual tools live in ./knowledge/*; this barrel
// keeps the original import path and the `knowledgeTools` registry array stable.
export { verify_citation, summarize_text } from "./knowledge/citation-tools";
export { rank_by_relevance, semantic_dedup } from "./knowledge/semantic-tools";
export { code_exec, youtube_transcript } from "./knowledge/exec-tools";

import { verify_citation, summarize_text } from "./knowledge/citation-tools";
import { rank_by_relevance, semantic_dedup } from "./knowledge/semantic-tools";
import { code_exec, youtube_transcript } from "./knowledge/exec-tools";

export const knowledgeTools = [
  verify_citation,
  summarize_text,
  rank_by_relevance,
  semantic_dedup,
  code_exec,
  youtube_transcript,
];
