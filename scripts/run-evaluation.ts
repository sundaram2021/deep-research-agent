// Lightweight quality-evaluation harness (LLM-as-judge).
//
//   pnpm eval                      # runs the built-in seed topics
//   pnpm eval "your topic here"    # runs a custom topic
//
// For each topic it plans, runs the full research pipeline, then grades the
// report on coverage / citation accuracy / faithfulness / depth. Requires
// OPENAI_API_KEY (and ideally TAVILY_API_KEY or EXA_API_KEY); skips gracefully
// without keys so CI does not fail.

import { z } from "zod";
import { getModelPair } from "../lib/models";
import { generateResearchPlan } from "../lib/agents/main-agent";
import { runResearchPipeline } from "../lib/research/pipeline";

const SEED_TOPICS = [
  "Compare the tradeoffs of REST vs gRPC for internal microservices",
  "What are the main approaches to retrieval-augmented generation and when to use each?",
];

const judgeSchema = z.object({
  coverage: z.number().min(0).max(10),
  citationAccuracy: z.number().min(0).max(10),
  faithfulness: z.number().min(0).max(10),
  depth: z.number().min(0).max(10),
  rationale: z.string(),
});

const JUDGE_SYSTEM = `You are a strict research-quality judge. Score the REPORT for the TOPIC from 0-10 on each axis:
- coverage: breadth of the important sub-questions addressed
- citationAccuracy: are claims backed by specific, plausible sources (real-looking URLs, not vague)?
- faithfulness: absence of fabrication or unsupported assertions
- depth: substance and insight beyond surface summary
Give a one-line rationale. Be critical; reserve 9-10 for genuinely excellent work.`;

interface EvalRow {
  topic: string;
  ms: number;
  coverage: number;
  citationAccuracy: number;
  faithfulness: number;
  depth: number;
  rationale: string;
}

async function evaluateTopic(topic: string): Promise<EvalRow> {
  const { main } = getModelPair();
  const started = Date.now();
  const { plan } = await generateResearchPlan(main, topic);
  const report = await runResearchPipeline({ topic, bullets: plan.bulletPoints, emit: () => {} });
  const ms = Date.now() - started;

  const judge = await main
    .withStructuredOutput(judgeSchema, { name: "ResearchJudge" })
    .invoke([
      { role: "system", content: JUDGE_SYSTEM },
      { role: "user", content: `TOPIC: ${topic}\n\nREPORT:\n${report.slice(0, 16000)}` },
    ]);

  return { topic, ms, ...judge };
}

function avgOf(r: EvalRow): number {
  return (r.coverage + r.citationAccuracy + r.faithfulness + r.depth) / 4;
}

async function runEval(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.log("[eval] OPENAI_API_KEY not set — skipping live evaluation. Set your keys and re-run `pnpm eval`.");
    return;
  }
  const args = process.argv.slice(2);
  const topics = args.length > 0 ? args : SEED_TOPICS;

  const rows: EvalRow[] = [];
  for (const topic of topics) {
    console.log(`[eval] running: ${topic}`);
    try {
      rows.push(await evaluateTopic(topic));
    } catch (err) {
      console.error(`[eval] failed: ${topic} —`, err instanceof Error ? err.message : err);
    }
  }

  console.log("\n=== EVALUATION RESULTS ===");
  for (const r of rows) {
    console.log(
      `\n• ${r.topic}\n  coverage=${r.coverage} citations=${r.citationAccuracy} faithfulness=${r.faithfulness} depth=${r.depth} avg=${avgOf(r).toFixed(1)} (${(r.ms / 1000).toFixed(1)}s)\n  ${r.rationale}`
    );
  }
  if (rows.length > 0) {
    const overall = (rows.reduce((s, r) => s + avgOf(r), 0) / rows.length).toFixed(2);
    console.log(`\nOVERALL AVG: ${overall} / 10 across ${rows.length} topic(s)`);
  }
}

runEval();
