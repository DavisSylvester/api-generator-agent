export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface TokenSnapshot {
  readonly taskId?: string;
  readonly model: string;
  readonly usage: TokenUsage;
  readonly cumulative: TokenUsage;
  readonly timestamp: string;
}

class TokenTracker {

  private promptTokens = 0;
  private completionTokens = 0;
  private totalTokens = 0;
  private history: TokenSnapshot[] = [];

  public record(model: string, usage: TokenUsage, taskId?: string): void {
    this.promptTokens += usage.promptTokens;
    this.completionTokens += usage.completionTokens;
    this.totalTokens += usage.totalTokens;

    this.history.push({
      taskId,
      model,
      usage,
      cumulative: {
        promptTokens: this.promptTokens,
        completionTokens: this.completionTokens,
        totalTokens: this.totalTokens,
      },
      timestamp: new Date().toISOString(),
    });
  }

  public recordEstimate(model: string, promptChars: number, completionChars: number, taskId?: string): void {
    // Rough estimate: 1 token ≈ 4 chars for English text/code
    const promptTokens = Math.ceil(promptChars / 4);
    const completionTokens = Math.ceil(completionChars / 4);
    this.record(model, {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    }, taskId);
  }

  public getCumulative(): TokenUsage {
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
    };
  }

  public getHistory(): readonly TokenSnapshot[] {
    return this.history;
  }

  public getSummary(): string {
    return `Tokens: ${this.totalTokens.toLocaleString()} total (${this.promptTokens.toLocaleString()} prompt + ${this.completionTokens.toLocaleString()} completion)`;
  }

  public reset(): void {
    this.promptTokens = 0;
    this.completionTokens = 0;
    this.totalTokens = 0;
    this.history = [];
  }
}

// Global singleton
export const tokenTracker = new TokenTracker();
