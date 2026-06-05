// Reflection stage: after a research wave, critically assess coverage and
// decide whether a targeted follow-up wave would materially improve the report.

import type { ChatOpenAI } from "@langchain/openai";
import { withRetry } from "../utils/network-helpers";
import {
  reflectionSchema,
  type Reflection,
  type ResearchAgentOutput,
} from "../schemas/agent-schemas";
import { REFLECTION_PROMPT } from "./prompts";

function digestResults(results: ResearchAgentOutput[]): string {
  return results
    .map((r) => {
      const findings = r.findings
        .map((f) => `  - ${f.title}: ${f.description} [src: ${f.sourceUrl || "none"}]`)
        .join("\n");
      return `Bullet ${r.bulletIndex} — ${r.bulletTitle} (confidence ${r.confidenceScore})\n  Summary: ${r.summary}\n${findings}`;
    })
    .join("\n\n");
}

const SUFFICIENT: Reflection = { sufficient: true, gaps: [], notes: "" };

/**
 * Identify the highest-value follow-up gaps (low confidence, missing coverage,
 * contradictions). Fails safe: any error returns "sufficient" so the pipeline
 * proceeds to synthesis instead of stalling.
 */
export async function reflectOnResults(
  model: ChatOpenAI,
  topic: string,
  results: ResearchAgentOutput[],
  maxGaps: number
): Promise<Reflection> {
  if (results.length === 0) return SUFFICIENT;
  const structured = model.withStructuredOutput(reflectionSchema, {
    name: "ResearchReflection",
  });
  try {
    const reflection = await withRetry(() =>
      structured.invoke([
        { role: "system", content: REFLECTION_PROMPT },
        {
          role: "user",
          content: `Topic: "${topic}"\n\nResearch gathered so far:\n\n${digestResults(
            results
          )}\n\nReturn at most ${maxGaps} follow-up gaps. If coverage is already strong and trustworthy, set sufficient=true and gaps=[].`,
        },
      ])
    );
    const parsed = reflectionSchema.safeParse(reflection);
    if (!parsed.success) return SUFFICIENT;
    return { ...parsed.data, gaps: parsed.data.gaps.slice(0, Math.max(0, maxGaps)) };
  } catch {
    return SUFFICIENT;
  }
}

export type { Reflection };
