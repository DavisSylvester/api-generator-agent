export const GENERATION_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in-progress",
  COMPLETE: "complete",
  FAILED: "failed",
} as const;

export type GenerationStatus = typeof GENERATION_STATUS[keyof typeof GENERATION_STATUS];
