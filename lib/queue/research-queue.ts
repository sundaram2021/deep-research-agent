// BullMQ queue definition for research jobs. The API enqueues jobs here; the
// worker process (worker/index.ts) consumes them.

import { Queue, type ConnectionOptions } from "bullmq";
import { createQueueConnection } from "./connection";

export const RESEARCH_QUEUE = "research";

export interface ResearchJobData {
  jobId: string;
  topic: string;
  bullets: unknown;
  reportFormat?: "brief" | "deep";
}

let queue: Queue<ResearchJobData> | null = null;

export function getResearchQueue(): Queue<ResearchJobData> {
  if (!queue) {
    queue = new Queue<ResearchJobData>(RESEARCH_QUEUE, {
      connection: createQueueConnection() as unknown as ConnectionOptions,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    }) as Queue<ResearchJobData>;
  }
  return queue;
}
