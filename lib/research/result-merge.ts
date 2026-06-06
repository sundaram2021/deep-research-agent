import type { ResearchAgentOutput } from "../schemas/agent-schemas";

// Merge a follow-up output into the result for its bullet: union findings (dedup
// by source+title), take the max confidence, and extend the summary.
export function mergeOutput(
  resultsMap: Map<number, ResearchAgentOutput>,
  output: ResearchAgentOutput
): void {
  const existing = resultsMap.get(output.bulletIndex);
  if (!existing) {
    resultsMap.set(output.bulletIndex, output);
    return;
  }
  const seen = new Set(existing.findings.map((f) => `${f.sourceUrl}::${f.title}`));
  for (const f of output.findings) {
    const key = `${f.sourceUrl}::${f.title}`;
    if (!seen.has(key)) {
      existing.findings.push(f);
      seen.add(key);
    }
  }
  existing.confidenceScore = Math.max(existing.confidenceScore, output.confidenceScore);
  if (output.summary && !existing.summary.includes(output.summary)) {
    existing.summary = `${existing.summary} ${output.summary}`.trim();
  }
}

export function shortTitle(directive: string): string {
  const trimmed = directive.trim().replace(/\s+/g, " ");
  return trimmed.length <= 60 ? trimmed : `${trimmed.slice(0, 57)}...`;
}
