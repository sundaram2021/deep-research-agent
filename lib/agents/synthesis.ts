import type { ChatOpenAI } from "@langchain/openai";
import {
  type MainAgentPlan,
  type ResearchAgentOutput,
} from "../schemas/agent-schemas";
import { SYNTHESIS_PROMPT } from "./prompts";

export interface SynthesisInput {
  plan: MainAgentPlan;
  results: ResearchAgentOutput[];
}

export interface SynthesisStream {
  output: AsyncIterable<string>;
  signal: AbortSignal;
}

export function buildSynthesisMessages(input: SynthesisInput) {
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

  return [
    { role: "system" as const, content: SYNTHESIS_PROMPT },
    {
      role: "user" as const,
      content: `Topic: "${input.plan.originalTopic}"\n\nResearch findings (one section per bullet):\n\n${sections}\n\nWrite the final README/markdown report now.`,
    },
  ];
}

export async function* streamSynthesis(
  model: ChatOpenAI,
  input: SynthesisInput,
  signal: AbortSignal
): AsyncIterable<string> {
  const messages = buildSynthesisMessages(input);
  const stream = await model.stream(messages, { signal });
  for await (const chunk of stream) {
    const text = typeof chunk.content === "string" ? chunk.content : "";
    if (text) yield text;
  }
}
