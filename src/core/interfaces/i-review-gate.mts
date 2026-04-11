export const REVIEW_DECISION = {
  APPROVE: "approve",
  REQUEST_CHANGES: "request-changes",
  SKIP: "skip",
} as const;

export type ReviewDecision = typeof REVIEW_DECISION[keyof typeof REVIEW_DECISION];

export interface IReviewResult {
  decision: ReviewDecision;
  feedback?: string;
}

export interface IReviewGate {
  /**
   * Present a PRD for review and await user decision.
   * Called after PRD generation, before code generation begins.
   */
  reviewPrd(prdContent: string): Promise<IReviewResult>;

  /**
   * Present a completed feature for review and await user decision.
   * Called after each feature passes verification gates.
   */
  reviewFeature(featureName: string, filesGenerated: string[]): Promise<IReviewResult>;
}
