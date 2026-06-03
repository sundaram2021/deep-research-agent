export class BaseError extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 500) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ToolValidationError extends BaseError {
  constructor(message: string, public readonly toolName: string) {
    super(message, "TOOL_VALIDATION_ERROR", 400);
  }
}

export class RateLimitError extends BaseError {
  constructor(message: string) {
    super(message, "RATE_LIMIT_ERROR", 429);
  }
}

export class LLMError extends BaseError {
  constructor(message: string, public readonly provider: string) {
    super(message, "LLM_ERROR", 502);
  }
}

export class SubagentError extends BaseError {
  constructor(message: string, public readonly subagentName: string) {
    super(message, "SUBAGENT_ERROR", 500);
  }
}
