import { createDeepAgent, createSummarizationMiddleware, StateBackend, registerHarnessProfile } from "deepagents";
import { ChatOpenAI } from "@langchain/openai";
import { searchTools } from "./tools/search-tools";
import { textTools } from "./tools/text-tools";
import { dataTools } from "./tools/data-tools";
import { agentTools } from "./tools/agent-tools";
import { researcherSubAgent } from "./subagents/researcher-agent";

// Exclude the default SummarizationMiddleware from the OpenAI harness profile
registerHarnessProfile("openai", {
  excludedMiddleware: ["SummarizationMiddleware"],
});

const apiKey = process.env.OPENAI_API_KEY || "mock-key";

const model = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0.2,
  openAIApiKey: apiKey,
});

const allTools = [...searchTools, ...textTools, ...dataTools, ...agentTools];

// Create our custom summarization middleware and rename it to avoid conflict
const customSummary = createSummarizationMiddleware({
  model,
  backend: new StateBackend(),
  trigger: { type: "messages", value: 15 },
  keep: { type: "messages", value: 5 },
});

const customSummaryRenamed = {
  ...customSummary,
  name: "CustomSummarizationMiddleware",
};

export const deepResearchAgent = createDeepAgent({
  name: "deep-research-agent",
  model,
  tools: allTools,
  subagents: [researcherSubAgent],
  middleware: [customSummaryRenamed],
});
