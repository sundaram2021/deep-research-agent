import { z } from "zod";

export const bulletPointSchema = z.object({
  index: z.number(),
  title: z.string(),
  description: z.string(),
});

export const mainAgentPlanSchema = z.object({
  originalTopic: z.string(),
  bulletPoints: z
    .array(bulletPointSchema)
    .min(3)
    .max(8),
  summary: z.string(),
});

export const researchFindingSchema = z.object({
  title: z.string(),
  description: z.string(),
  evidence: z.string(),
  sourceUrl: z.string().default(""),
});

export const researchAgentOutputSchema = z.object({
  bulletIndex: z.number(),
  bulletTitle: z.string(),
  findings: z.array(researchFindingSchema),
  summary: z.string(),
  confidenceScore: z.number().min(0).max(1),
});

// Reflection stage output: gaps the orchestrator should close in a follow-up wave.
export const reflectionGapSchema = z.object({
  bulletIndex: z.number(), // index of the related bullet, or 0 for a new sub-question
  directive: z.string(),
  reason: z.enum(["low_confidence", "coverage_gap", "contradiction"]),
});

export const reflectionSchema = z.object({
  sufficient: z.boolean(),
  gaps: z.array(reflectionGapSchema),
  notes: z.string(),
});

export const synthesizedReportSchema = z.object({
  title: z.string(),
  executiveSummary: z.string(),
  sections: z.array(
    z.object({
      heading: z.string(),
      content: z.string(),
      sources: z.array(z.string()),
    })
  ),
  conclusion: z.string(),
});

export type BulletPoint = z.infer<typeof bulletPointSchema>;
export type MainAgentPlan = z.infer<typeof mainAgentPlanSchema>;
export type ResearchAgentOutput = z.infer<typeof researchAgentOutputSchema>;
export type ReflectionGap = z.infer<typeof reflectionGapSchema>;
export type Reflection = z.infer<typeof reflectionSchema>;
export type SynthesizedReport = z.infer<typeof synthesizedReportSchema>;
