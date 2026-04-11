import type { IReviewGate, IReviewResult } from "./i-review-gate.mts";
import { REVIEW_DECISION } from "./i-review-gate.mts";

/**
 * Auto-approve review gate for non-interactive environments
 * (e.g., CI pipelines, testing, or batch generation mode).
 * Always approves without pausing.
 */
export class AutoApproveReviewGate implements IReviewGate {

  public async reviewPrd(_prdContent: string): Promise<IReviewResult> {
    return { decision: REVIEW_DECISION.APPROVE };
  }

  public async reviewFeature(
    _featureName: string,
    _filesGenerated: string[],
  ): Promise<IReviewResult> {
    return { decision: REVIEW_DECISION.APPROVE };
  }
}
