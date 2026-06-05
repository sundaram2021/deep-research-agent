// POST /api/research/[jobId]/cancel — cooperatively cancel a running/queued job.
// Sets a Redis flag the worker checks between waves; a queued job aborts as soon
// as it starts. (Pause/resume of an in-flight run needs orchestrator checkpointing
// and is deferred.)

import { NextRequest } from "next/server";
import { getJob, requestCancel } from "../../../../../lib/jobs/job-store";
import { isDbConfigured } from "../../../../../lib/db/client";
import { isRedisConfigured } from "../../../../../lib/queue/connection";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isDbConfigured() || !isRedisConfigured()) {
    return json(503, { error: "Durable jobs require DATABASE_URL and REDIS_URL" });
  }
  const { jobId } = await ctx.params;
  const job = await getJob(jobId);
  if (!job) return json(404, { error: "Job not found" });
  if (job.status === "complete" || job.status === "error" || job.status === "cancelled") {
    return json(409, { error: `Job already ${job.status}` });
  }
  await requestCancel(jobId);
  return json(202, { jobId, status: "cancelling" });
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
