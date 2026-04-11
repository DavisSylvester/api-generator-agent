import type { Logger } from "winston";
import type {
  ITestDetail,
  ITestGateResult,
} from "../core/interfaces/index.mts";

export async function runTestGate(
  projectDir: string,
  logger: Logger,
): Promise<ITestGateResult> {
  const startMs = performance.now();
  const errors: string[] = [];
  const warnings: string[] = [];

  logger.info(`[test-gate] Running bun test in ${projectDir}`);

  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;
  let testDetails: ITestDetail[] = [];

  try {
    const proc = Bun.spawn(
      ["bun", "test"],
      { cwd: projectDir, stdout: "pipe", stderr: "pipe" },
    );
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const combined = stdout + "\n" + stderr;

    const parsed = parseTestOutput(combined);
    passCount = parsed.passCount;
    failCount = parsed.failCount;
    skipCount = parsed.skipCount;
    testDetails = parsed.testDetails;

    if (exitCode !== 0) {
      errors.push(`Tests failed with exit code ${exitCode}`);
      for (const detail of testDetails) {
        if (detail.status === "fail") {
          errors.push(`FAIL: ${detail.name}${detail.error ? ` - ${detail.error}` : ""}`);
        }
      }
    } else {
      logger.info(`[test-gate] All tests passed (${passCount} pass, ${skipCount} skip)`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Test execution failed: ${msg}`);
  }

  const durationMs = Math.round(performance.now() - startMs);
  const totalCount = passCount + failCount + skipCount;

  logger.info(
    `[test-gate] Complete: ${passCount} pass, ${failCount} fail, ${skipCount} skip (${durationMs}ms)`,
  );

  return {
    passed: errors.length === 0,
    gate: "test",
    errors,
    warnings,
    durationMs,
    passCount,
    failCount,
    skipCount,
    totalCount,
    testDetails,
  };
}

interface ParsedTestOutput {
  passCount: number;
  failCount: number;
  skipCount: number;
  testDetails: ITestDetail[];
}

export function parseTestOutput(output: string): ParsedTestOutput {
  const testDetails: ITestDetail[] = [];
  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;

  const summaryMatch = output.match(/(\d+)\s+pass/);
  if (summaryMatch?.[1]) {
    passCount = parseInt(summaryMatch[1], 10);
  }

  const failMatch = output.match(/(\d+)\s+fail/);
  if (failMatch?.[1]) {
    failCount = parseInt(failMatch[1], 10);
  }

  const skipMatch = output.match(/(\d+)\s+skip/);
  if (skipMatch?.[1]) {
    skipCount = parseInt(skipMatch[1], 10);
  }

  const lines = output.split("\n");
  let currentDescribe = "";

  for (const line of lines) {
    const trimmed = line.trim();

    const describeMatch = trimmed.match(/^(?:describe|suite)\s*>\s*(.+)/i);
    if (describeMatch?.[1]) {
      currentDescribe = describeMatch[1];
      continue;
    }

    const passMatch = parsePassLine(trimmed);
    if (passMatch) {
      const fullName = currentDescribe ? `${currentDescribe} > ${passMatch}` : passMatch;
      testDetails.push({ name: fullName, status: "pass" });
      continue;
    }

    const failLineMatch = parseFailLine(trimmed);
    if (failLineMatch) {
      const fullName = currentDescribe
        ? `${currentDescribe} > ${failLineMatch}`
        : failLineMatch;
      testDetails.push({ name: fullName, status: "fail" });
      continue;
    }

    const skipLineMatch = parseSkipLine(trimmed);
    if (skipLineMatch) {
      const fullName = currentDescribe
        ? `${currentDescribe} > ${skipLineMatch}`
        : skipLineMatch;
      testDetails.push({ name: fullName, status: "skip" });
    }
  }

  return { passCount, failCount, skipCount, testDetails };
}

function parsePassLine(line: string): string | undefined {
  const match = line.match(/^\u2713\s+(.+?)(?:\s+\[\d+\.\d+ms\])?$/);
  return match?.[1];
}

function parseFailLine(line: string): string | undefined {
  const match = line.match(/^\u2717\s+(.+?)(?:\s+\[\d+\.\d+ms\])?$/);
  return match?.[1];
}

function parseSkipLine(line: string): string | undefined {
  const match = line.match(/^-\s+(.+?)(?:\s+\[skipped\])?$/);
  return match?.[1];
}
