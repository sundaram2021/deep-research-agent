// Cross-run L2 cache (Redis) for search results and fetched content. The
// per-request SourcePool is L1 (within one run); this persists across runs so
// repeated/overlapping queries don't re-hit (and re-bill) providers. No-ops
// gracefully when REDIS_URL is not configured.

import { createHash } from "node:crypto";
import type Redis from "ioredis";
import { createRedisClient, isRedisConfigured } from "../queue/connection";

let client: Redis | null = null;
function redis(): Redis | null {
  if (!isRedisConfigured()) return null;
  if (!client) client = createRedisClient();
  return client;
}

const TTL_SECONDS = Math.max(60, Number(process.env.CACHE_TTL_SECONDS) || 86400);

function cacheKey(namespace: string, raw: string): string {
  return `cache:${namespace}:${createHash("sha1").update(raw).digest("hex")}`;
}

export async function cacheGet(namespace: string, raw: string): Promise<string | null> {
  const r = redis();
  if (!r) return null;
  try {
    return await r.get(cacheKey(namespace, raw));
  } catch {
    return null; // cache failures must never break a research run
  }
}

export async function cacheSet(namespace: string, raw: string, value: string): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(cacheKey(namespace, raw), value, "EX", TTL_SECONDS);
  } catch {
    /* ignore cache write failures */
  }
}
