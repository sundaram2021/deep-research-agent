// Runs a research subagent in a genuinely ISOLATED context: a fresh deep-agent
// instance with its OWN scoped tool set (search + knowledge only) and its OWN
// message history / thread_id. The parent never inherits the subagent's
// intermediate reasoning — it receives only the structured ResearchAgentOutput
// the subagent returns. This is the real context-isolation boundary behind the
// `spawn_research_subagent` tool (a relabelled function call would not satisfy it).

import { createDeepAgent } from "deepagents";
import { providerStrategy } from "langchain";
import { searchTools } from "../tools/search-tools";
import { knowledgeTools } from "../tools/knowledge-tools";
import { getModelPair } from "../models";
import { extractResearchOutput } from "./researcher-output";
import { researchAgentOutputSchema, type ResearchAgentOutput } from "../schemas/agent-schemas";
import { withSpan, logger } from "../utils/observability-logger";

// Deliberately a SUBSET of the full 50+ tool registry — and deliberately without
// the orchestration tools, so a spawned subagent cannot spawn further subagents
// (recursion is bounded at depth 1). This is the subagent's "own scoped tool set".
const SUBAGENT_TOOLS = [...searchTools, ...knowledgeTools];

const SUBAGENT_PROMPT = `You are an isolated research subagent with a scoped tool set (web search + knowledge tools).
Investigate the single OBJECTIVE you are given: run 2-5 targeted searches, fetch the best 1-2 sources, and extract evidence.
Then output ONLY a JSON object: {"findings":[{"title","description","evidence","sourceUrl"}],"summary","confidenceScore"}.
Cite only real URLs you actually fetched — never fabricate sources. Return at most 6 findings. Do not exceed 8 tool calls.`;

let counter = 0;

export interface SubagentResult {
  output: ResearchAgentOutput | null;
  error?: string;
}

/**
 * Spawn an isolated research subagent for a self-contained objective and return
 * its structured output. Never throws: failures degrade to { output: null, error }
 * so the calling tool returns a message instead of aborting the parent run.
 */
export async function runResearchSubagent(objective: string, context = ""): Promise<SubagentResult> {
  const { researcher, extractor } = getModelPair();
  const threadId = `spawned-${Date.now()}-${++counter}`;

  const agent = createDeepAgent({
    name: "spawned_researcher",
    model: researcher,
    tools: SUBAGENT_TOOLS,
    subagents: [],
    systemPrompt: SUBAGENT_PROMPT,
    responseFormat: providerStrategy(researchAgentOutputSchema),
  }) as unknown as { invoke: (input: unknown, config?: unknown) => Promise<unknown> };

  const prompt = context.trim()
    ? `OBJECTIVE: ${objective}\n\nCONTEXT FROM PARENT:\n${context.slice(0, 4000)}`
    : `OBJECTIVE: ${objective}`;

  return withSpan(
    "subagent.spawn",
    async (): Promise<SubagentResult> => {
      try {
        const result = await agent.invoke(
          { messages: [{ role: "user", content: prompt }] },
          { recursionLimit: 25, configurable: { thread_id: threadId } }
        );
        const text = lastMessageText(result);
        const output = await extractResearchOutput(extractor, text, 0, objective.slice(0, 80));
        if (!output) return { output: null, error: "subagent produced no parseable output" };
        return { output };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        logger.error("subagent.spawn.failed", { threadId, error });
        return { output: null, error };
      }
    },
    { threadId, objective: objective.slice(0, 120) }
  );
}

// Robustly pull the final assistant text out of a deep-agent invoke() result,
// tolerating both string and content-part-array message shapes.
function lastMessageText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const messages = (result as { messages?: unknown[] }).messages;
  if (!Array.isArray(messages) || messages.length === 0) return "";
  const last = messages[messages.length - 1] as { content?: unknown };
  return contentToText(last?.content);
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        typeof p === "string"
          ? p
          : typeof (p as { text?: unknown }).text === "string"
            ? (p as { text: string }).text
            : ""
      )
      .join("");
  }
  return "";
}
