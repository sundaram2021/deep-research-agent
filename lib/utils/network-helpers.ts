// Resilience helpers for external API and model calls: retry with exponential
// backoff + jitter, bounded concurrency (pLimit), and a spacing rate limiter.

import { RateLimitError } from "./typed-errors";
import { logger } from "./observability-logger";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
}

/** Heuristic: is this error worth retrying (network blip, 429, 5xx)? */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RateLimitError) return true;
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (/\b(408|409|425|429|500|502|503|504)\b/.test(msg)) return true;
  return /(rate.?limit|timeout|timed out|econnreset|etimedout|enotfound|eai_again|socket hang up|network|fetch failed|temporarily|overloaded)/.test(
    msg
  );
}

/** Run `fn`, retrying on transient failures with exponential backoff + jitter. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    factor = 2,
    jitter = true,
    shouldRetry = isRetryableError,
    onRetry,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error)) break;
      const backoff = Math.min(maxDelayMs, baseDelayMs * factor ** attempt);
      const delay = jitter ? backoff * (0.5 + Math.random() / 2) : backoff;
      const retryAfter =
        error instanceof RateLimitError ? error.retryAfterMs : undefined;
      // Observability: every retry is logged with attempt count + backoff, so
      // transient-failure patterns are visible without each caller wiring onRetry.
      logger.warn("retry.attempt", {
        attempt: attempt + 1,
        maxRetries: retries,
        delayMs: Math.round(retryAfter ?? delay),
        error,
      });
      onRetry?.(error, attempt + 1);
      await sleep(retryAfter ?? delay);
    }
  }
  throw lastError;
}

export type LimitFn = <T>(fn: () => Promise<T>) => Promise<T>;

/**
 * Bounded-concurrency runner. Returns a function that never lets more than
 * `concurrency` wrapped promises run at once; the rest queue in FIFO order.
 */
export function pLimit(concurrency: number): LimitFn {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("pLimit: concurrency must be a positive integer");
  }
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    active--;
    if (queue.length > 0) queue.shift()!();
  };

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active++;
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(next);
      };
      if (active < concurrency) start();
      else queue.push(start);
    });
  };
}

/** Serializes calls with a minimum interval between them (req/sec throttling). */
export class RateLimiter {
  private last = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly minIntervalMs: number;
  constructor(minIntervalMs: number) {
    this.minIntervalMs = minIntervalMs;
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = Math.max(0, this.last + this.minIntervalMs - Date.now());
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      return fn();
    };
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => undefined);
    return result;
  }
}
