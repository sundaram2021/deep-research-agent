import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { runResearchSubagent } from "../agents/subagent-runner";

// Orchestration namespace: model-callable delegation. `spawn_research_subagent`
// lets the agent decide (via a tool call) to spin up an isolated research
// subagent for a self-contained sub-question. The subagent runs its own
// deep-agent graph with a fresh message history and a scoped tool set, then
// returns ONLY structured findings — real context isolation, not a relabelled
// function call. Its JSON output is designed to compose into the caller's work
// (e.g. feed into summarize_text, rank_by_relevance, or compile_markdown_report).
export const spawn_research_subagent = tool(
  async ({ objective, context }) => {
    const { output, error } = await runResearchSubagent(objective, context);
    if (!output) return `Error: spawn_research_subagent failed (${error ?? "unknown error"})`;
    return JSON.stringify(output);
  },
  {
    name: "spawn_research_subagent",
    description:
      "Delegate a self-contained sub-question to an isolated research subagent. It runs in its own context with a scoped tool set (web search + knowledge tools) and returns structured findings as JSON: {findings:[{title,description,evidence,sourceUrl}], summary, confidenceScore}. Use for a broad sub-question that deserves its own focused investigation; compose the returned JSON into your report. Pass context as an empty string if there is no extra context to forward.",
    schema: z.object({
      objective: z.string(),
      context: z.string(),
    }),
  }
);

export const orchestrationTools = [spawn_research_subagent];
