import { NextRequest } from "next/server";
import { z } from "zod";
import type { ChatOpenAI } from "@langchain/openai";
import { getModelPair } from "../../../lib/models";
import { generateResearchPlan } from "../../../lib/agents/main-agent";
import {
  buildResearcherPrompt,
  buildFollowupPrompt,
  createResearcherAgent,
} from "../../../lib/agents/researcher-agent";
import { streamSynthesis } from "../../../lib/agents/synthesis";
import { extractResearchOutput } from "../../../lib/agents/researcher-output";
import { reflectOnResults } from "../../../lib/agents/reflection";
import { SourcePool, withSourcePool } from "../../../lib/agents/source-pool";
import { pLimit } from "../../../lib/utils/network-helpers";
import {
  bulletPointSchema,
  type BulletPoint,
  type ResearchAgentOutput,
} from "../../../lib/schemas/agent-schemas";
import { extractText, extractToolContent } from "./stream-helpers";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_WAVES = 2; // wave 1 + up to (MAX_WAVES - 1) reflection-driven waves
const DEFAULT_MAX_FOLLOWUPS = 3; // gaps investigated per reflection wave

const requestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  action: z.enum(["plan", "research"]).default("plan"),
  bulletPoints: z.array(bulletPointSchema).min(1).max(8).optional(),
});

interface AgentEvent {
  type: string;
  id?: string;
  name?: string;
  parent?: string | null;
  data?: unknown;
  ts: number;
}

type Emit = (event: AgentEvent) => void;

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

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const { prompt, action, bulletPoints } = parsed.data;
  if (!bulletPoints && action === "research") {
    return errorResponse(400, "bulletPoints required for research action");
  }

  const encoder = new TextEncoder();
  const send = (
    controller: ReadableStreamDefaultController,
    event: AgentEvent
  ) => {
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      // controller may be closed during cancellation
    }
  };

  if (action === "plan") {
    return streamPlanPhase(prompt, send);
  }
  return streamResearchPhase(prompt, bulletPoints ?? [], send);
}

function streamPlanPhase(
  prompt: string,
  send: (c: ReadableStreamDefaultController, e: AgentEvent) => void
) {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        send(controller, { type: "run.start", ts: Date.now() });
        const { main } = getModelPair();
        const { plan, raw } = await generateResearchPlan(main, prompt);
        send(controller, { type: "plan.ready", data: { plan, raw }, ts: Date.now() });
        send(controller, { type: "run.end", ts: Date.now() });
      } catch (err) {
        send(controller, { type: "run.error", data: { message: errMessage(err) }, ts: Date.now() });
      } finally {
        controller.close();
      }
    },
  });
  return sseResponse(stream);
}

function streamResearchPhase(
  prompt: string,
  bullets: BulletPoint[],
  send: (c: ReadableStreamDefaultController, e: AgentEvent) => void
) {
  const stream = new ReadableStream({
    async start(controller) {
      const emit: Emit = (event) => send(controller, event);
      const pool = new SourcePool();
      try {
        await withSourcePool(pool, async () => {
          emit({ type: "research.start", ts: Date.now() });

          const { main, researcher } = getModelPair();
          const handle = createResearcherAgent(researcher);
          const concurrency = Math.max(1, Number(process.env.RESEARCH_CONCURRENCY) || DEFAULT_CONCURRENCY);
          const maxWaves = Math.max(1, Number(process.env.RESEARCH_MAX_WAVES) || DEFAULT_MAX_WAVES);
          const maxFollowups = Math.max(1, Number(process.env.RESEARCH_MAX_FOLLOWUPS) || DEFAULT_MAX_FOLLOWUPS);
          const limit = pLimit(concurrency);

          // --- Wave 1: one researcher per planned bullet ---
          const wave1Tasks: SubagentTask[] = bullets.map((bullet) => ({
            runId: `subagent-${bullet.index}-${Date.now()}`,
            prompt: buildResearcherPrompt(prompt, bullet),
            bullet,
            bulletIndex: bullet.index,
            bulletTitle: bullet.title,
          }));
          const wave1 = await runWave(handle, researcher, emit, limit, wave1Tasks);

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
            emit({ type: "reflection.start", data: { wave }, ts: Date.now() });
            const reflection = await reflectOnResults(
              main,
              prompt,
              [...resultsMap.values()],
              maxFollowups
            );
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
                prompt: buildFollowupPrompt(prompt, gap.directive, gap.reason),
                bullet: { index: targetIndex, title, description: gap.directive },
                bulletIndex: targetIndex,
                bulletTitle: title,
              };
            });
            const followRuns = await runWave(handle, researcher, emit, limit, followTasks);
            for (const run of followRuns) if (run.output) mergeOutput(resultsMap, run.output);
          }

          // --- Synthesis ---
          const results = [...resultsMap.values()].sort((a, b) => a.bulletIndex - b.bulletIndex);
          emit({ type: "synthesis.start", ts: Date.now() });

          const aborted = new AbortController();
          let assembled = "";
          for await (const token of streamSynthesis(
            main,
            { plan: { originalTopic: prompt, bulletPoints: bullets, summary: "" }, results },
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
          emit({ type: "run.end", ts: Date.now() });
        });
      } catch (err) {
        emit({ type: "run.error", data: { message: errMessage(err) }, ts: Date.now() });
      } finally {
        controller.close();
      }
    },
  });
  return sseResponse(stream);
}

async function runWave(
  handle: ReturnType<typeof createResearcherAgent>,
  model: ChatOpenAI,
  emit: Emit,
  limit: <T>(fn: () => Promise<T>) => Promise<T>,
  tasks: SubagentTask[]
): Promise<SubagentRun[]> {
  return Promise.all(tasks.map((task) => limit(() => runSubagent(handle, model, emit, task))));
}

async function runSubagent(
  handle: ReturnType<typeof createResearcherAgent>,
  model: ChatOpenAI,
  emit: Emit,
  task: SubagentTask
): Promise<SubagentRun> {
  const { runId, prompt, bullet, bulletIndex, bulletTitle } = task;
  emit({ type: "subagent.start", id: runId, name: handle.name, data: { bullet }, ts: Date.now() });
  try {
    const events = handle.agent.streamEvents(
      { messages: [{ role: "user", content: prompt }] },
      { version: "v2", recursionLimit: 40 }
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

    const parsed = await extractResearchOutput(model, lastText, bulletIndex, bulletTitle);
    if (!parsed) {
      emit({ type: "subagent.error", id: runId, data: { message: "Failed to parse researcher output" }, ts: Date.now() });
      return { bulletIndex, bulletTitle, output: null, error: "parse failed" };
    }
    // The orchestrator owns bullet identity, so the merge stays correct even if
    // the model echoed a different index/title.
    const output: ResearchAgentOutput = { ...parsed, bulletIndex, bulletTitle };
    emit({ type: "subagent.end", id: runId, name: handle.name, data: { output }, ts: Date.now() });
    return { bulletIndex, bulletTitle, output };
  } catch (err) {
    emit({ type: "subagent.error", id: runId, data: { message: errMessage(err) }, ts: Date.now() });
    return { bulletIndex, bulletTitle, output: null, error: errMessage(err) };
  }
}

// Merge a follow-up output into the result for its bullet: union findings
// (dedup by source+title), take the max confidence, and extend the summary.
function mergeOutput(
  resultsMap: Map<number, ResearchAgentOutput>,
  output: ResearchAgentOutput
): void {
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

function sseResponse(stream: ReadableStream) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
