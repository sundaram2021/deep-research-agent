// Simple per-job token budget. The pipeline accumulates token usage from model
// turns and stops launching further (reflection-driven) waves once the budget is
// exceeded, so a run can't spiral in cost. limit <= 0 means unlimited.

export class TokenBudget {
  private used = 0;
  constructor(private readonly limit: number) {}

  add(tokens: number): void {
    if (Number.isFinite(tokens) && tokens > 0) this.used += tokens;
  }

  get total(): number {
    return this.used;
  }

  get max(): number {
    return this.limit;
  }

  exceeded(): boolean {
    return this.limit > 0 && this.used >= this.limit;
  }
}
