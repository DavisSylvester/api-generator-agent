import { describe, it, expect } from "bun:test";
import {
  REVIEW_DECISION,
  AutoApproveReviewGate,
  CallbackReviewGate,
} from "../../src/core/interfaces/index.mts";
import type {
  IReviewGate,
  IReviewResult,
  ReviewCallback,
} from "../../src/core/interfaces/index.mts";

describe("REVIEW_DECISION", () => {
  it("should have approve, request-changes, and skip values", () => {
    expect(REVIEW_DECISION.APPROVE).toBe("approve");
    expect(REVIEW_DECISION.REQUEST_CHANGES).toBe("request-changes");
    expect(REVIEW_DECISION.SKIP).toBe("skip");
  });
});

describe("AutoApproveReviewGate", () => {
  it("should implement IReviewGate", () => {
    const gate: IReviewGate = new AutoApproveReviewGate();
    expect(gate).toBeTruthy();
  });

  it("should auto-approve PRD review", async () => {
    const gate = new AutoApproveReviewGate();
    const result = await gate.reviewPrd("# Some PRD content");

    expect(result.decision).toBe(REVIEW_DECISION.APPROVE);
    expect(result.feedback).toBeUndefined();
  });

  it("should auto-approve feature review", async () => {
    const gate = new AutoApproveReviewGate();
    const result = await gate.reviewFeature("WorkOrder", [
      "src/work-order/interfaces/i-work-order.mts",
      "src/work-order/service/work-order-service.mts",
    ]);

    expect(result.decision).toBe(REVIEW_DECISION.APPROVE);
    expect(result.feedback).toBeUndefined();
  });
});

describe("CallbackReviewGate", () => {
  it("should delegate PRD review to callback", async () => {
    let capturedLabel = "";
    let capturedContent = "";

    const callback: ReviewCallback = async (
      label: string,
      content: string,
    ): Promise<IReviewResult> => {
      capturedLabel = label;
      capturedContent = content;
      return {
        decision: REVIEW_DECISION.APPROVE,
        feedback: "Looks good!",
      };
    };

    const gate = new CallbackReviewGate(callback);
    const result = await gate.reviewPrd("# My PRD");

    expect(capturedLabel).toBe("PRD Review");
    expect(capturedContent).toBe("# My PRD");
    expect(result.decision).toBe(REVIEW_DECISION.APPROVE);
    expect(result.feedback).toBe("Looks good!");
  });

  it("should delegate feature review to callback", async () => {
    let capturedLabel = "";
    let capturedContent = "";

    const callback: ReviewCallback = async (
      label: string,
      content: string,
    ): Promise<IReviewResult> => {
      capturedLabel = label;
      capturedContent = content;
      return { decision: REVIEW_DECISION.SKIP };
    };

    const gate = new CallbackReviewGate(callback);
    const result = await gate.reviewFeature("Users", [
      "src/users/service.mts",
    ]);

    expect(capturedLabel).toBe("Feature Review");
    expect(capturedContent).toContain("Feature: Users");
    expect(capturedContent).toContain("src/users/service.mts");
    expect(result.decision).toBe(REVIEW_DECISION.SKIP);
  });

  it("should support request-changes decision", async () => {
    const callback: ReviewCallback = async (): Promise<IReviewResult> => ({
      decision: REVIEW_DECISION.REQUEST_CHANGES,
      feedback: "Please add validation for email field",
    });

    const gate = new CallbackReviewGate(callback);
    const result = await gate.reviewPrd("# Draft PRD");

    expect(result.decision).toBe(REVIEW_DECISION.REQUEST_CHANGES);
    expect(result.feedback).toBe("Please add validation for email field");
  });
});
