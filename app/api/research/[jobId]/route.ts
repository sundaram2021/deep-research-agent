// GET /api/research/[jobId] — job status + final report (once complete).

import { NextRequest } from "next/server";
import { getJob } from "../../../../lib/jobs/job-store";
import { isDbConfigured } from "../../../../lib/db/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isDbConfigured()) return json(503, { error: "DATABASE_URL is not set" });
  const { jobId } = await ctx.params;
  const job = await getJob(jobId);
  if (!job) return json(404, { error: "Job not found" });

  // Export the final report as a downloadable markdown file: ?download=md
  if (new URL(req.url).searchParams.get("download") === "md") {
    if (!job.report) return json(409, { error: `Report not ready (status: ${job.status})` });
    return new Response(job.report, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="research-${jobId}.md"`,
      },
    });
  }

  return json(200, {
    id: job.id,
    status: job.status,
    topic: job.topic,
    report: job.report,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
