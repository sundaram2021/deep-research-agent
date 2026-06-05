// Headless research pipeline: plan is done elsewhere (fast, synchronous); this
// runs the iterative research — wave 1, reflection-driven follow-up waves, and
// synthesis — emitting events through an `emit` callback. The same pipeline backs
// both the streaming HTTP route and the durable BullMQ worker.

import type { ChatOpenAI } from "@langchain/openai";
import { getModelPair } from "../models";
import {
  buildResearcherPrompt,
  buildFollowupPrompt,
  createResearcherAgent,
} from "../agents/researcher-agent";
import { streamSynthesis } from "../agents/synthesis";
import { extractResearchOutput } from "../agents/researcher-output";
import { reflectOnResults } from "../agents/reflection";
import { getCheckpointer } from "../agents/checkpointer";
import { SourcePool, withSourcePool } from "../agents/source-pool";
import { pLimit } from "../utils/network-helpers";
import { TokenBudget } from "./budget";
import { CancelledError } from "../utils/typed-errors";
import type { BulletPoint, ResearchAgentOutput } from "../schemas/agent-schemas";

export interface AgentEvent {
  type: string;
  id?: string;
  name?: string;
  parent?: string | null;
  data?: unknown;
  ts: number;
}

export type Emit = (event: AgentEvent) => void;

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_WAVES = 2;
const DEFAULT_MAX_FOLLOWUPS = 3;

interface SubagentTask {
  runId: string;
  prompt: string;
  bullet: BulletPoint;
  bulletIndex: number;
  bulletTitle: string;
}

interface SubagentRun {
  bulletIndex: number;
  bulletTitle: string;
  output: ResearchAgentOutput | null;
  error?: string;
}

export interface PipelineInput {
  topic: string;
  bullets: BulletPoint[];
  emit: Emit;
  // Cooperative cancellation, checked between waves and before synthesis.
  checkCancelled?: () => boolean | Promise<boolean>;
}

// Emits research.start ... research.complete. The caller owns run.start/run.end/
// run.error so HTTP and worker lifecycles can differ. Returns the final report.
export async function runResearchPipeline({ topic, bullets, emit, checkCancelled }: PipelineInput): Promise<string> {
  const pool = new SourcePool();
  return withSourcePool(pool, async () => {
    emit({ type: "research.start", ts: Date.now() });

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

    if (resultsMap.size === 0) {
      throw new Error("All subagent research failed; cannot synthesize");
    }

    // --- Reflection-driven follow-up waves ---
    let nextIndex = bullets.reduce((m, b) => Math.max(m, b.index), 0) + 1;
    let wave = 1;
    while (wave < maxWaves) {
      await ensureNotCancelled();
      if (budget.exceeded()) {
        emit({ type: "budget.exceeded", data: { used: budget.total, limit: budget.max }, ts: Date.now() });
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
      aborted.signal
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
    return assembled;
  });
}

async function runWave(
  handle: ReturnType<typeof createResearcherAgent>,
  repairModel: ChatOpenAI,
  emit: Emit,
  limit: <T>(fn: () => Promise<T>) => Promise<T>,
  tasks: SubagentTask[],
  onUsage: (tokens: number) => void
): Promise<SubagentRun[]> {
  return Promise.all(tasks.map((task) => limit(() => runSubagent(handle, repairModel, emit, task, onUsage))));
}

async function runSubagent(
  handle: ReturnType<typeof createResearcherAgent>,
  repairModel: ChatOpenAI,
  emit: Emit,
  task: SubagentTask,
  onUsage: (tokens: number) => void
): Promise<SubagentRun> {
  const { runId, prompt, bullet, bulletIndex, bulletTitle } = task;
  emit({ type: "subagent.start", id: runId, name: handle.name, data: { bullet }, ts: Date.now() });
  try {
    const events = handle.agent.streamEvents(
      { messages: [{ role: "user", content: prompt }] },
      { version: "v2", recursionLimit: 40, configurable: { thread_id: runId } }
    );
    let lastText = "";
    for await (const ev of events) {
      if (ev.event === "on_chat_model_stream") {
        const text = extractText(ev.data?.chunk);
        if (text) {
          lastText += text;
          emit({ type: "model.token", id: runId, parent: handle.name, data: { text }, ts: Date.now() });
        }
      } else if (ev.event === "on_chat_model_end") {
        const out = ev.data?.output as { usage_metadata?: { total_tokens?: number } } | undefined;
        if (typeof out?.usage_metadata?.total_tokens === "number") onUsage(out.usage_metadata.total_tokens);
        const finalText = extractText(ev.data?.output);
        if (finalText) lastText = finalText;
      } else if (ev.event === "on_tool_start") {
        emit({
          type: "tool.start",
          id: String(ev.run_id ?? `${runId}-${String(ev.name ?? "tool")}`),
          name: String(ev.name ?? "tool"),
          parent: runId,
          data: { args: ev.data?.input },
          ts: Date.now(),
        });
      } else if (ev.event === "on_tool_end") {
        emit({
          type: "tool.end",
          id: String(ev.run_id ?? `${runId}-${String(ev.name ?? "tool")}`),
          name: String(ev.name ?? "tool"),
          parent: runId,
          data: { output: extractToolContent(ev.data?.output) },
          ts: Date.now(),
        });
      }
    }

    const parsed = await extractResearchOutput(repairModel, lastText, bulletIndex, bulletTitle);
    if (!parsed) {
      emit({ type: "subagent.error", id: runId, data: { message: "Failed to parse researcher output" }, ts: Date.now() });
      return { bulletIndex, bulletTitle, output: null, error: "parse failed" };
    }
    const output: ResearchAgentOutput = { ...parsed, bulletIndex, bulletTitle };
    emit({ type: "subagent.end", id: runId, name: handle.name, data: { output }, ts: Date.now() });
    return { bulletIndex, bulletTitle, output };
  } catch (err) {
    emit({ type: "subagent.error", id: runId, data: { message: errMessage(err) }, ts: Date.now() });
    return { bulletIndex, bulletTitle, output: null, error: errMessage(err) };
  }
}

// Merge a follow-up output into the result for its bullet: union findings (dedup
// by source+title), take the max confidence, and extend the summary.
function mergeOutput(resultsMap: Map<number, ResearchAgentOutput>, output: ResearchAgentOutput): void {
  const existing = resultsMap.get(output.bulletIndex);
  if (!existing) {
    resultsMap.set(output.bulletIndex, output);
    return;
  }
  const seen = new Set(existing.findings.map((f) => `${f.sourceUrl}::${f.title}`));
  for (const f of output.findings) {
    const key = `${f.sourceUrl}::${f.title}`;
    if (!seen.has(key)) {
      existing.findings.push(f);
      seen.add(key);
    }
  }
  existing.confidenceScore = Math.max(existing.confidenceScore, output.confidenceScore);
  if (output.summary && !existing.summary.includes(output.summary)) {
    existing.summary = `${existing.summary} ${output.summary}`.trim();
  }
}

function shortTitle(directive: string): string {
  const trimmed = directive.trim().replace(/\s+/g, " ");
  return trimmed.length <= 60 ? trimmed : `${trimmed.slice(0, 57)}...`;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// --- Inlined stream helpers (kept here so lib/ does not import app/) ---
function extractText(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const o = obj as { content?: unknown; text?: unknown };
  if (typeof o.content === "string") return o.content;
  if (typeof o.text === "string") return o.text;
  if (Array.isArray(o.content)) {
    return o.content
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof (part as { text?: unknown }).text === "string"
            ? (part as { text: string }).text
            : ""
      )
      .join("");
  }
  return "";
}

function extractToolContent(obj: unknown): string {
  if (obj == null) return "";
  if (typeof obj === "string") return obj;
  if (typeof obj === "object") {
    const o = obj as { content?: unknown };
    if (typeof o.content === "string") return o.content;
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }
  return String(obj);
}
