// GET /api/research/[jobId]/stream — resumable SSE.
//
// Replays the persisted event log (optionally from ?after=<seq> for reconnects),
// then follows live events via Redis pub/sub. To avoid missing events published
// during replay, we subscribe FIRST and buffer, then replay, then flush — all
// de-duplicated by seq. The client can disconnect and reconnect with the last
// seq it saw and lose nothing.

import { NextRequest } from "next/server";
import { getEvents, getJob, jobChannel, rowToEvent } from "../../../../../lib/jobs/job-store";
import { createRedisClient } from "../../../../../lib/queue/connection";
import { isDbConfigured } from "../../../../../lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TERMINAL = new Set(["run.end", "run.error"]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  if (!isDbConfigured()) return new Response("DATABASE_URL is not set", { status: 503 });
  const { jobId } = await ctx.params;
  const job = await getJob(jobId);
  if (!job) return new Response("Job not found", { status: 404 });

  const after = Number(new URL(req.url).searchParams.get("after") ?? "0") || 0;
  const encoder = new TextEncoder();
  const sub = createRedisClient();

  const stream = new ReadableStream({
    async start(controller) {
      let lastSeq = after;
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* controller closed */
        }
      };
      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        void sub.quit();
      };
      const handle = (ev: { seq?: number; type?: string }) => {
        if (typeof ev.seq === "number") {
          if (ev.seq <= lastSeq) return; // already delivered (replay/dup)
          lastSeq = ev.seq;
        }
        send(ev);
        if (ev.type && TERMINAL.has(ev.type)) finish();
      };

      // 1) Subscribe first; buffer live messages until replay completes.
      let flushing = true;
      const buffer: Array<{ seq?: number; type?: string }> = [];
      sub.on("message", (_channel, message) => {
        let ev: { seq?: number; type?: string };
        try {
          ev = JSON.parse(message);
        } catch {
          return;
        }
        if (flushing) buffer.push(ev);
        else handle(ev);
      });
      await sub.subscribe(jobChannel(jobId));

      // 2) Replay everything persisted past `after`. rowToEvent restores the full
      // envelope (id/name/parent) so reconnecting clients can pair tool/subagent
      // starts and ends and keep parent scoping — identical to the live publish.
      const past = await getEvents(jobId, after);
      for (const row of past) {
        handle(rowToEvent(row));
        if (closed) return;
      }

      // If the job already finished, replay covered it — terminal event closed us.
      if (job.status === "complete" || job.status === "error") {
        if (!closed) finish();
        return;
      }

      // 3) Flush anything buffered during replay, then go live.
      flushing = false;
      for (const ev of buffer) {
        handle(ev);
        if (closed) return;
      }

      req.signal.addEventListener("abort", finish);
    },
    cancel() {
      void sub.quit();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
