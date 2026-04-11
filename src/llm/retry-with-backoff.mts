import type { Logger } from "winston";
import { classifyLlmError, type LlmError } from "../types/llm-errors.mts";

export interface RetryConfig {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelayMs: 2000,
  maxDelayMs: 120000,
};

function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponential = config.baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, config.maxDelayMs);
  const jitter = Math.random() * capped * 0.5;
  return capped + jitter;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  logger: Logger,
  label: string,
  config: RetryConfig = DEFAULT_CONFIG,
): Promise<T> {
  let lastError: LlmError | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = classifyLlmError(error);

      if (!lastError.retryable) {
        logger.error(`[retry] ${label}: non-retryable error — ${lastError.name}: ${lastError.message}`);
        throw lastError;
      }

      if (attempt >= config.maxRetries) {
        logger.error(`[retry] ${label}: exhausted ${config.maxRetries} retries — ${lastError.name}: ${lastError.message}`);
        throw lastError;
      }

      const delayMs = lastError.statusCode === 429 && "retryAfterMs" in lastError && lastError.retryAfterMs
        ? (lastError.retryAfterMs as number)
        : calculateDelay(attempt, config);

      logger.warn(`[retry] ${label}: ${lastError.name} — retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${config.maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError ?? new Error(`${label}: retry loop exited unexpectedly`);
}
