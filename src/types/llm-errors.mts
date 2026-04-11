export class LlmError extends Error {

  public readonly statusCode?: number;
  public readonly retryable: boolean;

  constructor(message: string, statusCode?: number, retryable: boolean = false) {
    super(message);
    this.name = "LlmError";
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export class RateLimitError extends LlmError {

  public readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message, 429, true);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class ContextWindowExceededError extends LlmError {

  constructor(message: string) {
    super(message, 400, false);
    this.name = "ContextWindowExceededError";
  }
}

export class AuthenticationError extends LlmError {

  constructor(message: string) {
    super(message, 401, false);
    this.name = "AuthenticationError";
  }
}

export class ModelUnavailableError extends LlmError {

  constructor(message: string, statusCode?: number) {
    super(message, statusCode, true);
    this.name = "ModelUnavailableError";
  }
}

export class CostLimitExceededError extends LlmError {

  public readonly accumulatedCost: number;
  public readonly limit: number;

  constructor(accumulatedCost: number, limit: number) {
    super(`Cost limit exceeded: $${accumulatedCost.toFixed(4)} > $${limit.toFixed(2)} limit`, undefined, false);
    this.name = "CostLimitExceededError";
    this.accumulatedCost = accumulatedCost;
    this.limit = limit;
  }
}

export function classifyLlmError(error: unknown): LlmError {
  const msg = error instanceof Error ? error.message : String(error);
  const msgLower = msg.toLowerCase();

  if (msgLower.includes("rate limit") || msgLower.includes("429") || msgLower.includes("too many requests")) {
    const retryMatch = msg.match(/retry.after[:\s]*(\d+)/i);
    const retryAfterMs = retryMatch && retryMatch[1] ? parseInt(retryMatch[1], 10) * 1000 : undefined;
    return new RateLimitError(msg, retryAfterMs);
  }

  if (msgLower.includes("context") && (msgLower.includes("length") || msgLower.includes("window") || msgLower.includes("exceeded"))) {
    return new ContextWindowExceededError(msg);
  }

  if (msgLower.includes("401") || msgLower.includes("unauthorized") || msgLower.includes("invalid api key") || msgLower.includes("authentication")) {
    return new AuthenticationError(msg);
  }

  if (msgLower.includes("503") || msgLower.includes("502") || msgLower.includes("overloaded") || msgLower.includes("unavailable")) {
    return new ModelUnavailableError(msg, 503);
  }

  if (msgLower.includes("500") || msgLower.includes("internal server error")) {
    return new ModelUnavailableError(msg, 500);
  }

  return new LlmError(msg, undefined, false);
}
