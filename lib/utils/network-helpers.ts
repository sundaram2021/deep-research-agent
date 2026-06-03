export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
  factor = 2
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      if (attempt >= retries) {
        throw error;
      }
      const isRateLimit = error?.status === 429 || error?.message?.includes("429");
      const nextDelay = isRateLimit ? delay * factor * 2 : delay * Math.pow(factor, attempt - 1);
      await sleep(nextDelay);
    }
  }
}

export class SimpleRateLimiter {
  private queue: (() => void)[] = [];
  private activeCount = 0;

  constructor(private readonly maxConcurrency: number, private readonly minIntervalMs: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private release(): void {
    this.activeCount--;
    const next = this.queue.shift();
    if (next) {
      this.activeCount++;
      setTimeout(next, this.minIntervalMs);
    }
  }
}
