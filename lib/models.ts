import { ChatOpenAI } from "@langchain/openai";

export interface ModelPair {
  main: ChatOpenAI; // strong tier: planning, reflection, synthesis
  researcher: ChatOpenAI; // medium tier: the research subagents
  extractor: ChatOpenAI; // cheap/fast tier: structured-output extraction & repair
}

let cached: ModelPair | null = null;

export function getModelPair(): ModelPair {
  if (cached) return cached;

  const apiKey = process.env.OPENAI_API_KEY ?? "";
  const mainName = process.env.OPENAI_MODEL ?? "gpt-5.4";
  const researcherName = process.env.RESEARCHER_MODEL ?? "gpt-5.1";
  // Defaults to the researcher model so behavior is unchanged until an operator
  // points EXTRACTOR_MODEL at a cheaper/faster model for the routine extraction work.
  const extractorName = process.env.EXTRACTOR_MODEL ?? researcherName;

  const base = { openAIApiKey: apiKey || "missing-key", maxRetries: 2, streaming: true };

  cached = {
    main: new ChatOpenAI({ ...base, modelName: mainName, temperature: 0.2 }),
    researcher: new ChatOpenAI({ ...base, modelName: researcherName, temperature: 0.3 }),
    extractor: new ChatOpenAI({ ...base, modelName: extractorName, temperature: 0 }),
  };
  return cached;
}
