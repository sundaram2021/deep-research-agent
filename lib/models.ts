import { ChatOpenAI } from "@langchain/openai";

export interface ModelPair {
  main: ChatOpenAI; // strong tier: planning, reflection, synthesis (direct fallback)
  researcher: ChatOpenAI; // medium tier: the research subagents
  extractor: ChatOpenAI; // cheap/fast tier: structured-output extraction & repair
  analyzer: ChatOpenAI; // light tier: the A2A Analyzer agent (formats the final report)
  collector: ChatOpenAI; // light tier: the A2A Collector agent (relays findings)
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
  // The A2A synthesis agents run on lighter tiers than `main`: the Analyzer
  // defaults to the medium researcher model (it only renders pre-numbered
  // findings into prose), and the mostly-mechanical Collector to the cheap tier.
  const analyzerName = process.env.ANALYZER_MODEL ?? researcherName;
  const collectorName = process.env.COLLECTOR_MODEL ?? extractorName;

  const base = { openAIApiKey: apiKey || "missing-key", maxRetries: 2, streaming: true };

  cached = {
    main: new ChatOpenAI({ ...base, modelName: mainName, temperature: 0.2 }),
    researcher: new ChatOpenAI({ ...base, modelName: researcherName, temperature: 0.3 }),
    extractor: new ChatOpenAI({ ...base, modelName: extractorName, temperature: 0 }),
    analyzer: new ChatOpenAI({ ...base, modelName: analyzerName, temperature: 0.2 }),
    collector: new ChatOpenAI({ ...base, modelName: collectorName, temperature: 0 }),
  };
  return cached;
}
