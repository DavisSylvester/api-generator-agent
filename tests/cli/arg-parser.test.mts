import { describe, it, expect } from "bun:test";
import {
  parseArgs,
  getHelpText,
  CLI_COMMANDS,
} from "../../src/cli/arg-parser.mts";

describe("parseArgs", () => {
  describe("no arguments", () => {
    it("should return error with showHelp when no args provided", () => {
      const result = parseArgs([]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.showHelp).toBe(true);
        expect(result.error.message).toContain("No command");
      }
    });
  });

  describe("unknown command", () => {
    it("should return error for unknown command", () => {
      const result = parseArgs(["invalid"]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("Unknown command");
        expect(result.error.message).toContain("invalid");
        expect(result.error.showHelp).toBe(true);
      }
    });
  });

  describe("--help flag", () => {
    it("should return showHelp for --help", () => {
      const result = parseArgs(["--help"]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.showHelp).toBe(true);
      }
    });

    it("should return showHelp for -h", () => {
      const result = parseArgs(["-h"]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.showHelp).toBe(true);
      }
    });
  });

  describe("generate command", () => {
    it("should parse generate with --prd flag", () => {
      const result = parseArgs(["generate", "my-api", "--prd", "./prd.md"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.command).toBe(CLI_COMMANDS.GENERATE);
        if (result.value.command === CLI_COMMANDS.GENERATE) {
          expect(result.value.projectName).toBe("my-api");
          expect(result.value.prdPath).toBe("./prd.md");
          expect(result.value.dryRun).toBe(false);
        }
      }
    });

    it("should parse generate with --prompt flag", () => {
      const result = parseArgs([
        "generate",
        "work-orders",
        "--prompt",
        "Build a work order API",
      ]);
      expect(result.ok).toBe(true);
      if (result.ok && result.value.command === CLI_COMMANDS.GENERATE) {
        expect(result.value.projectName).toBe("work-orders");
        expect(result.value.prompt).toBe("Build a work order API");
      }
    });

    it("should parse --dry-run flag", () => {
      const result = parseArgs([
        "generate",
        "my-api",
        "--prd",
        "./prd.md",
        "--dry-run",
      ]);
      expect(result.ok).toBe(true);
      if (result.ok && result.value.command === CLI_COMMANDS.GENERATE) {
        expect(result.value.dryRun).toBe(true);
      }
    });

    it("should parse --max-iterations flag", () => {
      const result = parseArgs([
        "generate",
        "my-api",
        "--prd",
        "./prd.md",
        "--max-iterations",
        "10",
      ]);
      expect(result.ok).toBe(true);
      if (result.ok && result.value.command === CLI_COMMANDS.GENERATE) {
        expect(result.value.maxIterations).toBe(10);
      }
    });

    it("should parse --output flag", () => {
      const result = parseArgs([
        "generate",
        "my-api",
        "--prd",
        "./prd.md",
        "--output",
        "/tmp/output",
      ]);
      expect(result.ok).toBe(true);
      if (result.ok && result.value.command === CLI_COMMANDS.GENERATE) {
        expect(result.value.outputDir).toBe("/tmp/output");
      }
    });

    it("should parse --flag=value syntax", () => {
      const result = parseArgs([
        "generate",
        "my-api",
        "--prd=./prd.md",
        "--max-iterations=7",
      ]);
      expect(result.ok).toBe(true);
      if (result.ok && result.value.command === CLI_COMMANDS.GENERATE) {
        expect(result.value.prdPath).toBe("./prd.md");
        expect(result.value.maxIterations).toBe(7);
      }
    });

    it("should error when project name is missing", () => {
      const result = parseArgs(["generate"]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("project name");
      }
    });

    it("should error when neither --prd nor --prompt is provided", () => {
      const result = parseArgs(["generate", "my-api"]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("--prd");
        expect(result.error.message).toContain("--prompt");
      }
    });

    it("should error when --max-iterations is not a valid number", () => {
      const result = parseArgs([
        "generate",
        "my-api",
        "--prd",
        "./prd.md",
        "--max-iterations",
        "abc",
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("--max-iterations");
      }
    });

    it("should parse all flags together", () => {
      const result = parseArgs([
        "generate",
        "fitness-tracker",
        "--prd",
        "./fitness.md",
        "--dry-run",
        "--max-iterations",
        "15",
        "--output",
        "./out",
      ]);
      expect(result.ok).toBe(true);
      if (result.ok && result.value.command === CLI_COMMANDS.GENERATE) {
        expect(result.value.projectName).toBe("fitness-tracker");
        expect(result.value.prdPath).toBe("./fitness.md");
        expect(result.value.dryRun).toBe(true);
        expect(result.value.maxIterations).toBe(15);
        expect(result.value.outputDir).toBe("./out");
      }
    });
  });

  describe("resume command", () => {
    it("should parse resume with run ID", () => {
      const result = parseArgs(["resume", "01HXYZ123456"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.command).toBe(CLI_COMMANDS.RESUME);
        if (result.value.command === CLI_COMMANDS.RESUME) {
          expect(result.value.runId).toBe("01HXYZ123456");
        }
      }
    });

    it("should parse resume with --max-iterations", () => {
      const result = parseArgs([
        "resume",
        "01HXYZ123456",
        "--max-iterations",
        "8",
      ]);
      expect(result.ok).toBe(true);
      if (result.ok && result.value.command === CLI_COMMANDS.RESUME) {
        expect(result.value.maxIterations).toBe(8);
      }
    });

    it("should parse resume with --output", () => {
      const result = parseArgs([
        "resume",
        "01HXYZ123456",
        "--output",
        "/tmp/ws",
      ]);
      expect(result.ok).toBe(true);
      if (result.ok && result.value.command === CLI_COMMANDS.RESUME) {
        expect(result.value.outputDir).toBe("/tmp/ws");
      }
    });

    it("should error when run ID is missing", () => {
      const result = parseArgs(["resume"]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("run ID");
      }
    });
  });

  describe("status command", () => {
    it("should parse status with run ID", () => {
      const result = parseArgs(["status", "01HXYZ123456"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.command).toBe(CLI_COMMANDS.STATUS);
        if (result.value.command === CLI_COMMANDS.STATUS) {
          expect(result.value.runId).toBe("01HXYZ123456");
        }
      }
    });

    it("should parse status with --output", () => {
      const result = parseArgs([
        "status",
        "01HXYZ123456",
        "--output",
        "/tmp/ws",
      ]);
      expect(result.ok).toBe(true);
      if (result.ok && result.value.command === CLI_COMMANDS.STATUS) {
        expect(result.value.outputDir).toBe("/tmp/ws");
      }
    });

    it("should error when run ID is missing", () => {
      const result = parseArgs(["status"]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("run ID");
      }
    });
  });

  describe("trace command", () => {
    it("should parse trace with run ID", () => {
      const result = parseArgs(["trace", "01HXYZ123456"]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.command).toBe(CLI_COMMANDS.TRACE);
        if (result.value.command === CLI_COMMANDS.TRACE) {
          expect(result.value.runId).toBe("01HXYZ123456");
        }
      }
    });

    it("should parse trace with --output", () => {
      const result = parseArgs([
        "trace",
        "01HXYZ123456",
        "--output",
        "/tmp/ws",
      ]);
      expect(result.ok).toBe(true);
      if (result.ok && result.value.command === CLI_COMMANDS.TRACE) {
        expect(result.value.outputDir).toBe("/tmp/ws");
      }
    });

    it("should error when run ID is missing", () => {
      const result = parseArgs(["trace"]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("run ID");
      }
    });
  });
});

describe("getHelpText", () => {
  it("should contain all commands", () => {
    const help = getHelpText();
    expect(help).toContain("generate");
    expect(help).toContain("resume");
    expect(help).toContain("status");
    expect(help).toContain("trace");
  });

  it("should contain key flags", () => {
    const help = getHelpText();
    expect(help).toContain("--prd");
    expect(help).toContain("--prompt");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--max-iterations");
    expect(help).toContain("--output");
  });

  it("should contain usage examples", () => {
    const help = getHelpText();
    expect(help).toContain("EXAMPLES:");
    expect(help).toContain("agent-one generate");
  });
});

describe("CLI_COMMANDS", () => {
  it("should define all four commands", () => {
    expect(CLI_COMMANDS.GENERATE).toBe("generate");
    expect(CLI_COMMANDS.RESUME).toBe("resume");
    expect(CLI_COMMANDS.STATUS).toBe("status");
    expect(CLI_COMMANDS.TRACE).toBe("trace");
  });
});
