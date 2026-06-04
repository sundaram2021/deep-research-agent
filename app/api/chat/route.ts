import { NextRequest } from "next/server";
import { z } from "zod";
import { getModelPair } from "../../../lib/models";
import { generateResearchPlan } from "../../../lib/agents/main-agent";
import {
  buildResearcherPrompt,
  createResearcherAgent,
} from "../../../lib/agents/researcher-agent";
import { streamSynthesis } from "../../../lib/agents/synthesis";
import {
  bulletPointSchema,
  researchAgentOutputSchema,
  type BulletPoint,
  type ResearchAgentOutput,
} from "../../../lib/schemas/agent-schemas";
import { extractText, extractToolContent } from "./stream-helpers";

export const runtime = "nodejs";
export const maxDuration = 300;

const bulletPointArray = z.array(bulletPointSchema).min(1).max(6);

const requestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  action: z.enum(["plan", "research"]).default("plan"),
  bulletPoints: z.array(bulletPointSchema).min(1).max(6).optional(),
});

interface AgentEvent {
  type: string;
  id?: string;
  name?: string;
  parent?: string | null;
  data?: unknown;
  ts: number;
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
        send(controller, {
          type: "plan.ready",
          data: { plan, raw },
          ts: Date.now(),
        });
        send(controller, { type: "run.end", ts: Date.now() });
      } catch (err) {
        send(controller, {
          type: "run.error",
          data: { message: errMessage(err) },
          ts: Date.now(),
        });
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
      try {
        send(controller, { type: "research.start", ts: Date.now() });

        const { main, researcher } = getModelPair();
        const handle = createResearcherAgent(researcher);

        const subagentResults = await runResearchersInParallel(
          handle,
          prompt,
          bullets,
          controller,
          send
        );

        const failed = subagentResults.filter((r) => !r.output);
        if (subagentResults.length === 0) {
          throw new Error("No research results were produced");
        }

        const results: ResearchAgentOutput[] = [];
        for (const r of subagentResults) {
          if (r.output) results.push(r.output);
        }

        if (results.length === 0) {
          throw new Error("All subagent research failed; cannot synthesize");
        }

        send(controller, {
          type: "synthesis.start",
          ts: Date.now(),
        });

        const aborted = new AbortController();
        let assembled = "";
        for await (const token of streamSynthesis(
          main,
          {
            plan: {
              originalTopic: prompt,
              bulletPoints: bullets,
              summary: "",
            },
            results,
          },
          aborted.signal
        )) {
          assembled += token;
          send(controller, {
            type: "synthesis.token",
            data: { text: token },
            ts: Date.now(),
          });
        }

        if (failed.length > 0) {
          assembled += `\n\n> ⚠️ ${failed.length} of ${bullets.length} subagents failed. Their bullet point(s) are missing from this report.\n`;
        }

        send(controller, {
          type: "final.content",
          data: { text: assembled },
          ts: Date.now(),
        });
        send(controller, { type: "synthesis.end", ts: Date.now() });
        send(controller, { type: "research.complete", ts: Date.now() });
        send(controller, { type: "run.end", ts: Date.now() });
      } catch (err) {
        send(controller, {
          type: "run.error",
          data: { message: errMessage(err) },
          ts: Date.now(),
        });
      } finally {
        controller.close();
      }
    },
  });
  return sseResponse(stream);
}

interface SubagentRun {
  bulletIndex: number;
  bulletTitle: string;
  output: ResearchAgentOutput | null;
  error?: string;
}

async function runResearchersInParallel(
  handle: ReturnType<typeof createResearcherAgent>,
  topic: string,
  bullets: BulletPoint[],
  controller: ReadableStreamDefaultController,
  send: (c: ReadableStreamDefaultController, e: AgentEvent) => void
): Promise<SubagentRun[]> {
  const tasks = bullets.map(async (bullet, i): Promise<SubagentRun> => {
    const runId = `subagent-${bullet.index}-${Date.now()}`;
    const prompt = buildResearcherPrompt(topic, bullet);
    send(controller, {
      type: "subagent.start",
      id: runId,
      name: handle.name,
      data: { bullet },
      ts: Date.now(),
    });
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
            send(controller, {
              type: "model.token",
              id: runId,
              parent: handle.name,
              data: { text },
              ts: Date.now(),
            });
          }
        } else if (ev.event === "on_chat_model_end") {
          const finalText = extractText(ev.data?.output);
          if (finalText) lastText = finalText;
        } else if (ev.event === "on_tool_start") {
          send(controller, {
            type: "tool.start",
            id: `${runId}-${String(ev.name ?? "tool")}-${Date.now()}`,
            name: String(ev.name ?? "tool"),
            parent: handle.name,
            data: { args: ev.data?.input },
            ts: Date.now(),
          });
        } else if (ev.event === "on_tool_end") {
          send(controller, {
            type: "tool.end",
            id: `${runId}-${String(ev.name ?? "tool")}-${Date.now()}`,
            name: String(ev.name ?? "tool"),
            parent: handle.name,
            data: { output: extractToolContent(ev.data?.output) },
            ts: Date.now(),
          });
        }
      }

      const parsed = parseResearcherOutput(lastText, bullet.index, bullet.title);
      if (!parsed) {
        send(controller, {
          type: "subagent.error",
          id: runId,
          data: { message: "Failed to parse researcher output" },
          ts: Date.now(),
        });
        return { bulletIndex: bullet.index, bulletTitle: bullet.title, output: null, error: "parse failed" };
      }
      send(controller, {
        type: "subagent.end",
        id: runId,
        name: handle.name,
        data: { output: parsed },
        ts: Date.now(),
      });
      return { bulletIndex: bullet.index, bulletTitle: bullet.title, output: parsed };
    } catch (err) {
      send(controller, {
        type: "subagent.error",
        id: runId,
        data: { message: errMessage(err) },
        ts: Date.now(),
      });
      return { bulletIndex: bullet.index, bulletTitle: bullet.title, output: null, error: errMessage(err) };
    } finally {
      // i unused but kept for future per-bullet progress
      void i;
    }
  });

  return Promise.all(tasks);
}

function parseResearcherOutput(
  text: string,
  bulletIndex: number,
  bulletTitle: string
): ResearchAgentOutput | null {
  const cleaned = stripCodeFences(text);
  const candidates: string[] = [];
  candidates.push(cleaned);

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
  }

  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      const coerced = {
        bulletIndex: obj.bulletIndex ?? bulletIndex,
        bulletTitle: obj.bulletTitle ?? bulletTitle,
        findings: Array.isArray(obj.findings) ? obj.findings : [],
        summary: typeof obj.summary === "string" ? obj.summary : "",
        confidenceScore:
          typeof obj.confidenceScore === "number" ? obj.confidenceScore : 0.5,
      };
      const result = researchAgentOutputSchema.safeParse(coerced);
      if (result.success) return result.data;
    } catch {
      // try next
    }
  }
  return null;
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
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
