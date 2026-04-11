import type { IReviewGate, IReviewResult } from "./i-review-gate.mts";

/**
 * Callback type for presenting content to the user and receiving a decision.
 * This abstraction allows both CLI prompts and Claude Code agent mode
 * to implement the review gate via the same interface.
 */
export type ReviewCallback = (
  label: string,
  content: string,
) => Promise<IReviewResult>;

/**
 * Callback-based review gate that delegates to an external function.
 * In CLI mode, the callback can display content and prompt for input.
 * In Claude Code agent mode, the callback can pause the conversation.
 */
export class CallbackReviewGate implements IReviewGate {

  private readonly onReview: ReviewCallback;

  constructor(onReview: ReviewCallback) {
    this.onReview = onReview;
  }

  public async reviewPrd(prdContent: string): Promise<IReviewResult> {
    return this.onReview("PRD Review", prdContent);
  }

  public async reviewFeature(
    featureName: string,
    filesGenerated: string[],
  ): Promise<IReviewResult> {
    const content = [
      `Feature: ${featureName}`,
      `Files generated: ${filesGenerated.length}`,
      ...filesGenerated.map((f) => `  - ${f}`),
    ].join("\n");

    return this.onReview("Feature Review", content);
  }
}
