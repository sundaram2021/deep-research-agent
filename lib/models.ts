import { ChatOpenAI } from "@langchain/openai";

export interface ModelPair {
  main: ChatOpenAI;
  researcher: ChatOpenAI;
}

let cached: ModelPair | null = null;

export function getModelPair(): ModelPair {
  if (cached) return cached;

  const apiKey = process.env.OPENAI_API_KEY ?? "";
  const mainName = process.env.OPENAI_MODEL ?? "gpt-5.4";
  const researcherName = process.env.RESEARCHER_MODEL ?? "gpt-5.1";

  const base = { openAIApiKey: apiKey || "missing-key", maxRetries: 2, streaming: true };

  cached = {
    main: new ChatOpenAI({ ...base, modelName: mainName, temperature: 0.2 }),
    researcher: new ChatOpenAI({ ...base, modelName: researcherName, temperature: 0.3 }),
  };
  return cached;
}
