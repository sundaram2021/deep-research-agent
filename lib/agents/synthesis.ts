import type { ChatOpenAI } from "@langchain/openai";
import {
  type MainAgentPlan,
  type ResearchAgentOutput,
} from "../schemas/agent-schemas";
import { SYNTHESIS_PROMPT, SYNTHESIS_BRIEF_PROMPT } from "./prompts";

export type ReportFormat = "brief" | "deep";

export interface SynthesisInput {
  plan: MainAgentPlan;
  results: ResearchAgentOutput[];
}

export function buildSynthesisMessages(input: SynthesisInput, format: ReportFormat = "deep") {
  // Assign a stable citation number to each unique source URL, in order of first
  // appearance across all findings. Findings that cite the same URL reuse the
  // same number, so the inline [n] markers map 1:1 to the numbered reference
  // list — exactly like citations in a research paper. Numbering is done here
  // (deterministically) rather than left to the model, so it is always correct.
  const citationByUrl = new Map<string, number>();
  const references: { n: number; title: string; url: string }[] = [];
  const citeUrl = (url: string, title: string): number | null => {
    const u = (url || "").trim();
    if (!u) return null;
    const existing = citationByUrl.get(u);
    if (existing !== undefined) return existing;
    const n = references.length + 1;
    citationByUrl.set(u, n);
    references.push({ n, title: (title || "").trim(), url: u });
    return n;
  };

  const sections = input.results
    .map((r) => {
      const findings = r.findings
        .map((f, i) => {
          const n = citeUrl(f.sourceUrl, f.title);
          const marker = n !== null ? ` [${n}]` : "";
          return `  ${i + 1}. **${f.title}** — ${f.description}${marker}\n     Evidence: ${f.evidence}\n     Source: ${f.sourceUrl || "N/A"}`;
        })
        .join("\n");
      return `### Bullet ${r.bulletIndex}: ${r.bulletTitle}\nSummary: ${r.summary}\nFindings:\n${findings}`;
    })
    .join("\n\n---\n\n");

  const referenceList =
    references.length > 0
      ? references.map((ref) => `${ref.n}. ${ref.title ? `${ref.title} — ` : ""}${ref.url}`).join("\n")
      : "(no external sources were cited)";

  const systemPrompt = format === "brief" ? SYNTHESIS_BRIEF_PROMPT : SYNTHESIS_PROMPT;
  const ask = format === "brief" ? "Write the concise executive brief now." : "Write the final README/markdown report now.";

  return [
    { role: "system" as const, content: systemPrompt },
    {
      role: "user" as const,
      content: `Topic: "${input.plan.originalTopic}"\n\nResearch findings (one section per bullet). Each finding is tagged with the citation number [n] you MUST use whenever you reference it:\n\n${sections}\n\n## Numbered sources\nUse these exact numbers for the inline [n] citations, and reproduce this list (as markdown links) in the References section. Do not renumber or omit any.\n\n${referenceList}\n\n${ask}`,
    },
  ];
}

export async function* streamSynthesis(
  model: ChatOpenAI,
  input: SynthesisInput,
  signal: AbortSignal,
  format: ReportFormat = "deep"
): AsyncIterable<string> {
  const messages = buildSynthesisMessages(input, format);
  const stream = await model.stream(messages, { signal });
  for await (const chunk of stream) {
    const text = typeof chunk.content === "string" ? chunk.content : "";
    if (text) yield text;
  }
}
