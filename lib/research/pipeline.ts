// Headless research pipeline: plan is done elsewhere (fast, synchronous); this
// runs the iterative research — wave 1, reflection-driven follow-up waves, and
// synthesis — emitting events through an `emit` callback. The same pipeline backs
// both the streaming HTTP route and the durable BullMQ worker.

import { getModelPair } from "../models";
import {
  buildResearcherPrompt,
  buildFollowupPrompt,
  createResearcherAgent,
} from "../agents/researcher-agent";
import { streamSynthesis } from "../agents/synthesis";
import { reflectOnResults } from "../agents/reflection";
import { getCheckpointer } from "../agents/checkpointer";
import { SourcePool, withSourcePool } from "../agents/source-pool";
import { pLimit } from "../utils/network-helpers";
import { logger } from "../utils/observability-logger";
import { TokenBudget } from "./budget";
import { CancelledError } from "../utils/typed-errors";
import type { ResearchAgentOutput } from "../schemas/agent-schemas";
import type { SubagentTask, PipelineInput } from "./pipeline-types";
import { runWave } from "./wave-runner";
import { mergeOutput, shortTitle } from "./result-merge";

export type { AgentEvent, Emit } from "./pipeline-types";

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_WAVES = 2;
const DEFAULT_MAX_FOLLOWUPS = 3;

// Emits research.start ... research.complete. The caller owns run.start/run.end/
// run.error so HTTP and worker lifecycles can differ. Returns the final report.
export async function runResearchPipeline({ topic, bullets, emit, checkCancelled, reportFormat }: PipelineInput): Promise<string> {
  const pool = new SourcePool();
  const startedAt = Date.now();
  return withSourcePool(pool, async () => {
    emit({ type: "research.start", ts: Date.now() });
    logger.info("pipeline.start", { topic, bullets: bullets.length });

    const { main, researcher, extractor } = getModelPair();
    const checkpointer = await getCheckpointer();
    const handle = createResearcherAgent(researcher, checkpointer ?? undefined);
    const concurrency = Math.max(1, Number(process.env.RESEARCH_CONCURRENCY) || DEFAULT_CONCURRENCY);
    const maxWaves = Math.max(1, Number(process.env.RESEARCH_MAX_WAVES) || DEFAULT_MAX_WAVES);
    const maxFollowups = Math.max(1, Number(process.env.RESEARCH_MAX_FOLLOWUPS) || DEFAULT_MAX_FOLLOWUPS);
    const limit = pLimit(concurrency);
    const budget = new TokenBudget(Number(process.env.RESEARCH_TOKEN_BUDGET) || 0);
    const onUsage = (tokens: number) => budget.add(tokens);
    const ensureNotCancelled = async () => {
      if (checkCancelled && (await checkCancelled())) throw new CancelledError("Research cancelled");
    };
    await ensureNotCancelled();

    // --- Wave 1: one researcher per planned bullet ---
    const wave1Tasks: SubagentTask[] = bullets.map((bullet) => ({
      runId: `subagent-${bullet.index}-${Date.now()}`,
      prompt: buildResearcherPrompt(topic, bullet),
      bullet,
      bulletIndex: bullet.index,
      bulletTitle: bullet.title,
    }));
    const wave1 = await runWave(handle, extractor, emit, limit, wave1Tasks, onUsage);

    const resultsMap = new Map<number, ResearchAgentOutput>();
    for (const run of wave1) if (run.output) resultsMap.set(run.output.bulletIndex, run.output);
    const failedWave1 = wave1.filter((r) => !r.output).length;
    logger.info("pipeline.wave.complete", { wave: 1, ok: resultsMap.size, failed: failedWave1 });

    if (resultsMap.size === 0) {
      logger.error("pipeline.failed", { reason: "all subagents failed", topic });
      throw new Error("All subagent research failed; cannot synthesize");
    }

    // --- Reflection-driven follow-up waves ---
    let nextIndex = bullets.reduce((m, b) => Math.max(m, b.index), 0) + 1;
    let wave = 1;
    while (wave < maxWaves) {
      await ensureNotCancelled();
      if (budget.exceeded()) {
        emit({ type: "budget.exceeded", data: { used: budget.total, limit: budget.max }, ts: Date.now() });
        logger.warn("pipeline.budget.exceeded", { used: budget.total, limit: budget.max });
        break;
      }
      emit({ type: "reflection.start", data: { wave }, ts: Date.now() });
      const reflection = await reflectOnResults(main, topic, [...resultsMap.values()], maxFollowups);
      emit({
        type: "reflection.end",
        data: { sufficient: reflection.sufficient, gaps: reflection.gaps.length, notes: reflection.notes },
        ts: Date.now(),
      });
      if (reflection.sufficient || reflection.gaps.length === 0) break;

      wave++;
      emit({ type: "wave.start", data: { wave, count: reflection.gaps.length }, ts: Date.now() });

      const followTasks: SubagentTask[] = reflection.gaps.map((gap) => {
        const attach = gap.bulletIndex > 0 && resultsMap.has(gap.bulletIndex);
        const targetIndex = attach ? gap.bulletIndex : nextIndex++;
        const title = attach ? resultsMap.get(gap.bulletIndex)!.bulletTitle : shortTitle(gap.directive);
        return {
          runId: `followup-${targetIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          prompt: buildFollowupPrompt(topic, gap.directive, gap.reason),
          bullet: { index: targetIndex, title, description: gap.directive },
          bulletIndex: targetIndex,
          bulletTitle: title,
        };
      });
      const followRuns = await runWave(handle, extractor, emit, limit, followTasks, onUsage);
      for (const run of followRuns) if (run.output) mergeOutput(resultsMap, run.output);
    }

    // --- Synthesis ---
    await ensureNotCancelled();
    const results = [...resultsMap.values()].sort((a, b) => a.bulletIndex - b.bulletIndex);
    emit({ type: "synthesis.start", ts: Date.now() });

    const aborted = new AbortController();
    let assembled = "";
    for await (const token of streamSynthesis(
      main,
      { plan: { originalTopic: topic, bulletPoints: bullets, summary: "" }, results },
      aborted.signal,
      reportFormat ?? "deep"
    )) {
      assembled += token;
      emit({ type: "synthesis.token", data: { text: token }, ts: Date.now() });
    }

    if (failedWave1 > 0) {
      assembled += `\n\n> ⚠️ ${failedWave1} of ${bullets.length} initial subagents failed; their bullet point(s) may be missing from this report.\n`;
    }

    emit({ type: "final.content", data: { text: assembled }, ts: Date.now() });
    emit({ type: "synthesis.end", ts: Date.now() });
    emit({ type: "research.complete", data: { sourcePool: pool.stats(), waves: wave }, ts: Date.now() });
    logger.info("pipeline.complete", { topic, waves: wave, durationMs: Date.now() - startedAt, ...pool.stats() });
    return assembled;
  });
}
