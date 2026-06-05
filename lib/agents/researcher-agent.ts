import { createDeepAgent } from "deepagents";
import { providerStrategy } from "langchain";
import { searchTools } from "../tools/search-tools";
import { textTools } from "../tools/text-tools";
import { dataTools } from "../tools/data-tools";
import { agentTools } from "../tools/agent-tools";
import { knowledgeTools } from "../tools/knowledge-tools";
import {
  researchAgentOutputSchema,
  type BulletPoint,
  type ResearchAgentOutput,
} from "../schemas/agent-schemas";
import type { ChatOpenAI } from "@langchain/openai";
import { RESEARCHER_PROMPT } from "./prompts";

const allTools = [...searchTools, ...textTools, ...dataTools, ...agentTools, ...knowledgeTools];

// Use a permissive interface for the agent so the caller can invoke without
// pulling the entire deepagents generic-type machinery into its own types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAgent = { streamEvents: (...args: any[]) => AsyncIterable<any>; invoke: (...args: any[]) => Promise<any> };

export interface ResearcherHandle {
  agent: AnyAgent;
  name: string;
}

export function createResearcherAgent(
  model: ChatOpenAI,
  checkpointer?: unknown
): ResearcherHandle {
  const agent = createDeepAgent({
    name: "researcher",
    model,
    tools: allTools,
    subagents: [],
    systemPrompt: RESEARCHER_PROMPT,
    responseFormat: providerStrategy(researchAgentOutputSchema),
    // Optional LangGraph checkpointer (opt-in; see lib/agents/checkpointer.ts).
    ...(checkpointer
      ? { checkpointer: checkpointer as NonNullable<Parameters<typeof createDeepAgent>[0]>["checkpointer"] }
      : {}),
  }) as unknown as ResearcherHandle["agent"];
  return { agent, name: "researcher" };
}

export function buildResearcherPrompt(
  topic: string,
  bullet: BulletPoint
): string {
  return `Original research topic: "${topic}"

Your assigned bullet point:
(${bullet.index}) ${bullet.title}: ${bullet.description}

Investigate this bullet thoroughly. Use at least 3 searches, fetch full content from the best 1-2 sources, and return a JSON object with your findings.`;
}

export function buildFollowupPrompt(
  topic: string,
  directive: string,
  reason: string
): string {
  return `Original research topic: "${topic}"

This is a FOLLOW-UP investigation triggered by a gap found after the first research pass (reason: ${reason}).

Gap to close:
${directive}

Investigate this specific gap. Run 2-3 targeted searches, fetch full content from the best 1-2 sources, and return a JSON object with your findings using the same schema as before. Cite only real sourceUrls you actually fetched.`;
}

export type { ResearchAgentOutput };
