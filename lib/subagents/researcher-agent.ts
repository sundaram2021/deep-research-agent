import { SubAgent } from "deepagents";
import { z } from "zod";
import { searchTools } from "../tools/search-tools";
import { textTools } from "../tools/text-tools";

export const researcherSubAgentResponseSchema = z.object({
  topic: z.string(),
  findings: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      evidence: z.string(),
      sourceUrl: z.string().optional(),
    })
  ),
  summary: z.string(),
  confidenceScore: z.number().min(0).max(1),
});

export const researcherSubAgent: SubAgent = {
  name: "researcher",
  description: "Specialized Deep Research Subagent. Use this subagent for detailed investigations, facts retrieval, multi-query searches, and gathering comprehensive evidence on a topic. Returns structured findings.",
  systemPrompt: "You are a specialized Deep Research Subagent. Your goal is to gather detailed information on the given topic, analyze it, and return a structured report with findings and evidence. Work step by step, using your search tools to find facts and verify claims. Be thorough and return the structured response format.",
  tools: [...searchTools, ...textTools],
  responseFormat: researcherSubAgentResponseSchema,
};
