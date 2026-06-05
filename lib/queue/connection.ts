// ioredis connections. BullMQ requires `maxRetriesPerRequest: null` on its
// connection; pub/sub clients use the default settings.

import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/** Connection for BullMQ queue/worker (must disable per-request retry cap). */
export function createQueueConnection(): Redis {
  return new Redis(REDIS_URL, { maxRetriesPerRequest: null });
}

/** General-purpose connection for pub/sub (publisher or subscriber). */
export function createRedisClient(): Redis {
  return new Redis(REDIS_URL);
}
