// POST /api/research — create a durable research job and enqueue it. Returns a
// jobId immediately (no request-duration limit). Plan the bullets first via
// POST /api/chat { action: "plan" }, then submit them here.

import { NextRequest } from "next/server";
import { z } from "zod";
import { bulletPointSchema } from "../../../lib/schemas/agent-schemas";
import { createJob } from "../../../lib/jobs/job-store";
import { getResearchQueue, RESEARCH_QUEUE } from "../../../lib/queue/research-queue";
import { isDbConfigured } from "../../../lib/db/client";
import { isRedisConfigured } from "../../../lib/queue/connection";

export const runtime = "nodejs";

const schema = z.object({
  prompt: z.string().min(1).max(4000),
  bulletPoints: z.array(bulletPointSchema).min(1).max(8),
});

export async function POST(req: NextRequest) {
  if (!isDbConfigured() || !isRedisConfigured()) {
    return json(503, {
      error:
        "Durable jobs require DATABASE_URL and REDIS_URL. Run `docker compose up -d` and set them in .env.local, or use /api/chat for in-request streaming.",
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return json(400, { error: parsed.error.issues[0]?.message ?? "Invalid request" });
  }
  const { prompt, bulletPoints } = parsed.data;

  try {
    const jobId = await createJob(prompt, bulletPoints);
    await getResearchQueue().add(RESEARCH_QUEUE, { jobId, topic: prompt, bullets: bulletPoints });
    return json(202, { jobId });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
