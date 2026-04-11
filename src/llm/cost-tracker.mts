import type { Logger } from "winston";

export interface LlmUsage {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cost: number;
  readonly taskId?: string;
}

// Cost per 1M tokens (input / output) as of 2026-04
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-5.4": { input: 2.50, output: 10.00 },
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  // Anthropic
  "claude-sonnet-4-6": { input: 3.00, output: 15.00 },
  "claude-haiku-4-5": { input: 0.80, output: 4.00 },
  "claude-opus-4-6": { input: 15.00, output: 75.00 },
  // Ollama (local — free)
  "qwen3.5:27b": { input: 0, output: 0 },
  "qwen3-coder-next": { input: 0, output: 0 },
};

function lookupPricing(model: string): { input: number; output: number } {
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }
  // Fuzzy match: check if model name starts with a known prefix
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(key)) {
      return pricing;
    }
  }
  // Unknown model — assume zero (local)
  return { input: 0, output: 0 };
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = lookupPricing(model);
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export class CostTracker {

  private readonly usages: LlmUsage[] = [];
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public record(model: string, inputTokens: number, outputTokens: number, taskId?: string): LlmUsage {
    const cost = calculateCost(model, inputTokens, outputTokens);
    const usage: LlmUsage = { model, inputTokens, outputTokens, cost, taskId };
    this.usages.push(usage);

    if (cost > 0) {
      this.logger.info(
        `[cost] ${model}: ${inputTokens} in / ${outputTokens} out = $${cost.toFixed(4)}${taskId ? ` (task: ${taskId})` : ""}`,
      );
    }

    return usage;
  }

  public getTaskCost(taskId: string): number {
    return this.usages
      .filter((u) => u.taskId === taskId)
      .reduce((sum, u) => sum + u.cost, 0);
  }

  public getTotalCost(): number {
    return this.usages.reduce((sum, u) => sum + u.cost, 0);
  }

  public getTotalInputTokens(): number {
    return this.usages.reduce((sum, u) => sum + u.inputTokens, 0);
  }

  public getTotalOutputTokens(): number {
    return this.usages.reduce((sum, u) => sum + u.outputTokens, 0);
  }

  public getCallCount(): number {
    return this.usages.length;
  }

  public getSummary(): CostSummary {
    return {
      totalInputTokens: this.getTotalInputTokens(),
      totalOutputTokens: this.getTotalOutputTokens(),
      totalCost: this.getTotalCost(),
      callCount: this.getCallCount(),
      usages: [...this.usages],
    };
  }
}

export interface CostSummary {
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCost: number;
  readonly callCount: number;
  readonly usages: readonly LlmUsage[];
}
