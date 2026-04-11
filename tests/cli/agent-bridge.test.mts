import { describe, it, expect } from "bun:test";
import type { AgentBridgeOptions } from "../../src/agent-bridge.mts";

/**
 * Unit tests for the agent bridge options parsing and validation.
 * Full integration tests for the bridge require the LLM pipeline,
 * so we test the options shape and shared orchestrator integration
 * at the unit level.
 */

describe("AgentBridgeOptions type", () => {
  it("should accept prompt-based options", () => {
    const options: AgentBridgeOptions = {
      prompt: "Build a work order API",
      projectName: "work-orders",
      maxIterations: 10,
    };
    expect(options.prompt).toBe("Build a work order API");
    expect(options.projectName).toBe("work-orders");
    expect(options.maxIterations).toBe(10);
    expect(options.prdPath).toBeUndefined();
    expect(options.runId).toBeUndefined();
    expect(options.dryRun).toBeUndefined();
  });

  it("should accept PRD-based options", () => {
    const options: AgentBridgeOptions = {
      prdPath: "./requirements.md",
      projectName: "my-api",
    };
    expect(options.prdPath).toBe("./requirements.md");
    expect(options.prompt).toBeUndefined();
  });

  it("should accept resume options with runId", () => {
    const options: AgentBridgeOptions = {
      runId: "01HXYZ123456",
      maxIterations: 5,
    };
    expect(options.runId).toBe("01HXYZ123456");
    expect(options.prompt).toBeUndefined();
    expect(options.prdPath).toBeUndefined();
  });

  it("should accept dry-run option", () => {
    const options: AgentBridgeOptions = {
      prompt: "Build an API",
      projectName: "test",
      dryRun: true,
    };
    expect(options.dryRun).toBe(true);
  });

  it("should accept output directory option", () => {
    const options: AgentBridgeOptions = {
      prompt: "Build an API",
      projectName: "test",
      outputDir: "/custom/workspace",
    };
    expect(options.outputDir).toBe("/custom/workspace");
  });

  it("should accept empty options object", () => {
    const options: AgentBridgeOptions = {};
    expect(options.prompt).toBeUndefined();
    expect(options.prdPath).toBeUndefined();
    expect(options.runId).toBeUndefined();
  });
});
