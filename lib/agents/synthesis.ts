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
  const sections = input.results
    .map((r) => {
      const findings = r.findings
        .map(
          (f, i) =>
            `  ${i + 1}. **${f.title}** — ${f.description}\n     Evidence: ${f.evidence}\n     Source: ${f.sourceUrl || "N/A"}`
        )
        .join("\n");
      return `### Bullet ${r.bulletIndex}: ${r.bulletTitle}\nConfidence: ${r.confidenceScore}\nSummary: ${r.summary}\nFindings:\n${findings}`;
    })
    .join("\n\n---\n\n");

  const systemPrompt = format === "brief" ? SYNTHESIS_BRIEF_PROMPT : SYNTHESIS_PROMPT;
  const ask = format === "brief" ? "Write the concise executive brief now." : "Write the final README/markdown report now.";

  return [
    { role: "system" as const, content: systemPrompt },
    {
      role: "user" as const,
      content: `Topic: "${input.plan.originalTopic}"\n\nResearch findings (one section per bullet):\n\n${sections}\n\n${ask}`,
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
