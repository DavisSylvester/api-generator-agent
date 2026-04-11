import { describe, it, expect } from "bun:test";
import { TEMPLATE_TYPE } from "../../src/core/enums/template-type.mts";
import { ADDON_TYPE } from "../../src/core/enums/addon-type.mts";
import { GENERATION_STATUS } from "../../src/core/types/generation-status.mts";
import type { TemplateType } from "../../src/core/enums/template-type.mts";
import type { AddonType } from "../../src/core/enums/addon-type.mts";
import type { GenerationStatus } from "../../src/core/types/generation-status.mts";

describe("Core Enums", () => {
  describe("TEMPLATE_TYPE", () => {
    it("should have BASE and ADDON values", () => {
      expect(TEMPLATE_TYPE.BASE).toBe("base");
      expect(TEMPLATE_TYPE.ADDON).toBe("addon");
    });

    it("should be assignable to TemplateType", () => {
      const t: TemplateType = TEMPLATE_TYPE.BASE;
      expect(t).toBe("base");
    });
  });

  describe("ADDON_TYPE", () => {
    it("should have all addon values", () => {
      expect(ADDON_TYPE.AZURE_TERRAFORM).toBe("azure-terraform");
      expect(ADDON_TYPE.AWS_CDK).toBe("aws-cdk");
      expect(ADDON_TYPE.QUEUE_CONSUMER).toBe("queue-consumer");
      expect(ADDON_TYPE.EXTERNAL_API_CLIENT).toBe("external-api-client");
      expect(ADDON_TYPE.TEAMS_NOTIFICATION).toBe("teams-notification");
      expect(ADDON_TYPE.TIMER_JOB).toBe("timer-job");
    });

    it("should be assignable to AddonType", () => {
      const a: AddonType = ADDON_TYPE.AZURE_TERRAFORM;
      expect(a).toBe("azure-terraform");
    });
  });

  describe("GENERATION_STATUS", () => {
    it("should have all status values", () => {
      expect(GENERATION_STATUS.PENDING).toBe("pending");
      expect(GENERATION_STATUS.IN_PROGRESS).toBe("in-progress");
      expect(GENERATION_STATUS.COMPLETE).toBe("complete");
      expect(GENERATION_STATUS.FAILED).toBe("failed");
    });

    it("should be assignable to GenerationStatus", () => {
      const s: GenerationStatus = GENERATION_STATUS.PENDING;
      expect(s).toBe("pending");
    });
  });
});
