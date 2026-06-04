import { ChatOpenAI } from "@langchain/openai";
import { mainAgentPlanSchema, type MainAgentPlan } from "../schemas/agent-schemas";
import { withRetry } from "../utils/network-helpers";
import { MAIN_AGENT_PLAN_PROMPT } from "./prompts";

export interface PlanResult {
  plan: MainAgentPlan;
  raw: string;
}

export async function generateResearchPlan(
  model: ChatOpenAI,
  topic: string
): Promise<PlanResult> {
  const structured = model.withStructuredOutput(mainAgentPlanSchema, {
    name: "ResearchPlan",
  });

  const result = await withRetry(() =>
    structured.invoke([
      { role: "system", content: MAIN_AGENT_PLAN_PROMPT },
      { role: "user", content: topic },
    ])
  );

  return { plan: result, raw: JSON.stringify(result) };
}
