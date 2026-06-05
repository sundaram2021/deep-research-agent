import { NextRequest } from "next/server";
import { z } from "zod";
import { getModelPair } from "../../../lib/models";
import { generateResearchPlan } from "../../../lib/agents/main-agent";
import { runResearchPipeline, type AgentEvent } from "../../../lib/research/pipeline";
import { bulletPointSchema, type BulletPoint } from "../../../lib/schemas/agent-schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  prompt: z.string().min(1).max(4000),
  action: z.enum(["plan", "research"]).default("plan"),
  bulletPoints: z.array(bulletPointSchema).min(1).max(8).optional(),
});

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

  if (action === "plan") {
    return streamPlanPhase(prompt);
  }
  return streamResearchPhase(prompt, bulletPoints ?? []);
}

function streamPlanPhase(prompt: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => enqueue(controller, encoder, e);
      try {
        emit({ type: "run.start", ts: Date.now() });
        const { main } = getModelPair();
        const { plan, raw } = await generateResearchPlan(main, prompt);
        emit({ type: "plan.ready", data: { plan, raw }, ts: Date.now() });
        emit({ type: "run.end", ts: Date.now() });
      } catch (err) {
        emit({ type: "run.error", data: { message: errMessage(err) }, ts: Date.now() });
      } finally {
        controller.close();
      }
    },
  });
  return sseResponse(stream);
}

// In-request streaming (back-compat). For long-running, disconnect-safe runs use
// POST /api/research + GET /api/research/[jobId]/stream (durable worker).
function streamResearchPhase(prompt: string, bullets: BulletPoint[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => enqueue(controller, encoder, e);
      try {
        await runResearchPipeline({ topic: prompt, bullets, emit });
        emit({ type: "run.end", ts: Date.now() });
      } catch (err) {
        emit({ type: "run.error", data: { message: errMessage(err) }, ts: Date.now() });
      } finally {
        controller.close();
      }
    },
  });
  return sseResponse(stream);
}

function enqueue(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: AgentEvent
) {
  try {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  } catch {
    // controller may be closed during cancellation
  }
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
