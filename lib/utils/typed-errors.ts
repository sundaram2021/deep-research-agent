// Typed error classes used across the research pipeline so callers can react
// to specific failure modes (e.g. retry on RateLimitError) instead of pattern
// matching on raw error strings.

export class AppError extends Error {
  constructor(message: string) {
    super(message);
    // Restore the prototype chain + a useful name after transpilation.
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A tool received arguments it could not validate or process. */
export class ToolValidationError extends AppError {}

/** An LLM / model invocation failed. */
export class LLMError extends AppError {}

/** A search or content-fetch provider failed. */
export class SearchError extends AppError {}

/** An upstream provider signalled a rate limit. Carries an optional backoff. */
export class RateLimitError extends AppError {
  readonly retryAfterMs?: number;
  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

/** A research subagent failed for a specific bullet point. */
export class SubagentError extends AppError {
  readonly bulletIndex: number;
  constructor(bulletIndex: number, message: string) {
    super(message);
    this.bulletIndex = bulletIndex;
  }
}

/** A job was cancelled cooperatively (distinct from a failure). */
export class CancelledError extends AppError {}
