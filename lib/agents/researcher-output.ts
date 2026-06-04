// Reliable extraction of a researcher subagent's structured output.
//
// The previous approach scraped the raw streamed text for the first/last brace
// and JSON.parse'd it; malformed or prose-wrapped output silently failed and
// the bullet was dropped from the report. This module first attempts a cheap
// in-process parse, then falls back to a model `withStructuredOutput` repair
// call that is guaranteed to satisfy the schema.

import type { ChatOpenAI } from "@langchain/openai";
import { withRetry } from "../utils/network-helpers";
import {
  researchAgentOutputSchema,
  type ResearchAgentOutput,
} from "../schemas/agent-schemas";

const REPAIR_SYSTEM = `You convert a research subagent's raw notes into a single strict JSON object.
Use ONLY URLs, evidence, and facts present in the provided text — never invent sources.
If a field is unknown, use an empty string or empty array and lower the confidenceScore.`;

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function jsonCandidates(text: string): string[] {
  const cleaned = stripCodeFences(text);
  const candidates = [cleaned];
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(cleaned.slice(first, last + 1));
  return candidates;
}

function coerce(
  obj: Record<string, unknown>,
  bulletIndex: number,
  bulletTitle: string
) {
  return {
    bulletIndex: typeof obj.bulletIndex === "number" ? obj.bulletIndex : bulletIndex,
    bulletTitle: typeof obj.bulletTitle === "string" ? obj.bulletTitle : bulletTitle,
    findings: Array.isArray(obj.findings) ? obj.findings : [],
    summary: typeof obj.summary === "string" ? obj.summary : "",
    confidenceScore:
      typeof obj.confidenceScore === "number" ? obj.confidenceScore : 0.5,
  };
}

/** Cheap path: parse JSON straight from the model text (no extra LLM call). */
export function tryParseResearchOutput(
  text: string,
  bulletIndex: number,
  bulletTitle: string
): ResearchAgentOutput | null {
  for (const candidate of jsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const result = researchAgentOutputSchema.safeParse(
        coerce(parsed, bulletIndex, bulletTitle)
      );
      if (result.success) return result.data;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Reliable path: coerce arbitrary notes into schema-valid structured output. */
export async function repairResearchOutput(
  model: ChatOpenAI,
  rawText: string,
  bulletIndex: number,
  bulletTitle: string
): Promise<ResearchAgentOutput | null> {
  const structured = model.withStructuredOutput(researchAgentOutputSchema, {
    name: "ResearchAgentOutput",
  });
  try {
    const result = await withRetry(() =>
      structured.invoke([
        { role: "system", content: REPAIR_SYSTEM },
        {
          role: "user",
          content: `Bullet ${bulletIndex} ("${bulletTitle}"). Convert these research notes into the schema:\n\n${rawText.slice(0, 12000)}`,
        },
      ])
    );
    const normalized = {
      ...result,
      bulletIndex: result.bulletIndex ?? bulletIndex,
      bulletTitle: result.bulletTitle ?? bulletTitle,
    };
    const parsed = researchAgentOutputSchema.safeParse(normalized);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Extract a researcher's structured output. Tries the cheap in-process parse
 * first; if that yields nothing usable, falls back to a structured-output
 * repair call so a well-researched bullet is never dropped on a formatting slip.
 */
export async function extractResearchOutput(
  model: ChatOpenAI,
  rawText: string,
  bulletIndex: number,
  bulletTitle: string
): Promise<ResearchAgentOutput | null> {
  const cheap = tryParseResearchOutput(rawText, bulletIndex, bulletTitle);
  if (cheap && cheap.findings.length > 0) return cheap;
  if (!rawText.trim()) return cheap;
  const repaired = await repairResearchOutput(model, rawText, bulletIndex, bulletTitle);
  return repaired ?? cheap;
}
