// Background worker: consumes research jobs from BullMQ and runs the full
// pipeline out-of-band from any HTTP request, persisting every event so clients
// can stream/replay via /api/research/[jobId]/stream.
//
// Run with: pnpm worker   (node --env-file=.env.local --import tsx worker/index.ts)

import { Worker, type ConnectionOptions } from "bullmq";
import { createQueueConnection } from "../lib/queue/connection";
import { RESEARCH_QUEUE, type ResearchJobData } from "../lib/queue/research-queue";
import { runResearchPipeline, type Emit } from "../lib/research/pipeline";
import { appendEvent, isCancelled, setError, setResult, setStatus } from "../lib/jobs/job-store";
import { CancelledError } from "../lib/utils/typed-errors";
import type { BulletPoint } from "../lib/schemas/agent-schemas";

const worker = new Worker<ResearchJobData>(
  RESEARCH_QUEUE,
  async (job) => {
    const { jobId, topic, bullets } = job.data;
    await setStatus(jobId, "running");

    // Serialize event persistence so seq order is preserved and every event is
    // flushed before the job is marked complete.
    let chain: Promise<unknown> = Promise.resolve();
    const emit: Emit = (event) => {
      chain = chain.then(() => appendEvent(jobId, event)).catch((e) => {
        console.error(`[worker] appendEvent failed for ${jobId}:`, e);
      });
    };

    emit({ type: "run.start", ts: Date.now() });
    try {
      const report = await runResearchPipeline({
        topic,
        bullets: bullets as BulletPoint[],
        emit,
        checkCancelled: () => isCancelled(jobId),
      });
      emit({ type: "run.end", ts: Date.now() });
      await chain;
      await setResult(jobId, report);
    } catch (err) {
      if (err instanceof CancelledError) {
        emit({ type: "run.error", data: { message: "Research cancelled" }, ts: Date.now() });
        await chain;
        await setStatus(jobId, "cancelled");
        return; // a cancelled job should not be retried
      }
      const message = err instanceof Error ? err.message : String(err);
      emit({ type: "run.error", data: { message }, ts: Date.now() });
      await chain;
      await setError(jobId, message);
      throw err; // surface to BullMQ for retry/failure accounting
    }
  },
  {
    connection: createQueueConnection() as unknown as ConnectionOptions,
    concurrency: Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 2),
  }
);

worker.on("ready", () => console.log(`[worker] listening on queue "${RESEARCH_QUEUE}"`));
worker.on("completed", (job) => console.log(`[worker] job ${job.id} completed`));
worker.on("failed", (job, err) => console.error(`[worker] job ${job?.id} failed:`, err?.message));

async function shutdown() {
  console.log("[worker] shutting down...");
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
