// Shared client-side rate limiters for external search providers. Each provider
// gets ONE limiter (a module singleton) so every call to that provider — from
// the provider classes AND the direct Exa tool calls in lib/tools/search-tools —
// is spaced by at least <PROVIDER>_MIN_INTERVAL_MS (falling back to
// SEARCH_MIN_INTERVAL_MS, default 250ms). This is PROACTIVE throttling that
// complements the REACTIVE 429 backoff already in withRetry: together they keep
// us under provider quotas instead of only reacting after a 429.

import { RateLimiter } from "./network-helpers";

function intervalFor(specific: string | undefined, fallbackMs: number): number {
  const n = Number(specific);
  return Number.isFinite(n) && n > 0 ? n : fallbackMs;
}

function defaultIntervalMs(): number {
  return intervalFor(process.env.SEARCH_MIN_INTERVAL_MS, 250);
}

let exa: RateLimiter | null = null;
let tavily: RateLimiter | null = null;

/** Shared limiter for all Exa calls (provider + direct tool calls). */
export function exaLimiter(): RateLimiter {
  if (!exa) exa = new RateLimiter(intervalFor(process.env.EXA_MIN_INTERVAL_MS, defaultIntervalMs()));
  return exa;
}

/** Shared limiter for all Tavily REST calls. */
export function tavilyLimiter(): RateLimiter {
  if (!tavily) tavily = new RateLimiter(intervalFor(process.env.TAVILY_MIN_INTERVAL_MS, defaultIntervalMs()));
  return tavily;
}
