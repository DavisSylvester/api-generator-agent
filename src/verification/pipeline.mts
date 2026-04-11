import type { Logger } from "winston";
import type { IVerificationResult } from "../core/interfaces/index.mts";
import type { TraceLogger } from "../trace/trace-logger.mts";
import { runEslintGate } from "./eslint-gate.mts";
import { runTestGate } from "./test-gate.mts";
import { runSmokeGate } from "./smoke-gate.mts";
import type { EndpointSpec } from "./smoke-gate.mts";
import { runPlaywrightGate } from "./playwright-gate.mts";
import type { PlaywrightGateConfig } from "./playwright-gate.mts";

export interface VerificationPipelineConfig {
  projectDir: string;
  port: number;
  skipSmoke?: boolean;
  skipPlaywright?: boolean;
  maxRetries?: number;
  endpoints?: EndpointSpec[];
  playwrightConfig?: Omit<PlaywrightGateConfig, "port">;
  featureName?: string;
}

export interface GateRun {
  gate: string;
  attempt: number;
  result: IVerificationResult;
}

export interface VerificationPipelineResult {
  passed: boolean;
  results: IVerificationResult[];
  gateRuns: GateRun[];
  totalDurationMs: number;
}

export async function runVerificationPipeline(
  config: VerificationPipelineConfig,
  logger: Logger,
  traceLogger?: TraceLogger,
): Promise<VerificationPipelineResult> {
  const startMs = performance.now();
  const results: IVerificationResult[] = [];
  const gateRuns: GateRun[] = [];
  const maxRetries = config.maxRetries ?? 3;
  const featureName = config.featureName ?? "unknown";

  logger.info(`[verification] Starting verification pipeline for ${config.projectDir}`);

  // Gate 1: ESLint
  const eslintResult = await runGateWithRetries(
    "eslint",
    maxRetries,
    () => runEslintGate(config.projectDir, logger, { maxRetries: 1 }),
    logger,
    gateRuns,
    traceLogger,
    featureName,
  );
  results.push(eslintResult);

  if (!eslintResult.passed) {
    logger.error("[verification] ESLint gate failed after retries");
    return buildResult(results, gateRuns, startMs);
  }

  // Gate 2: Tests
  const testResult = await runGateWithRetries(
    "test",
    maxRetries,
    () => runTestGate(config.projectDir, logger),
    logger,
    gateRuns,
    traceLogger,
    featureName,
  );
  results.push(testResult);

  if (!testResult.passed) {
    logger.error("[verification] Test gate failed after retries");
    return buildResult(results, gateRuns, startMs);
  }

  // Gate 3: Smoke test (optional)
  if (!config.skipSmoke) {
    const smokeResult = await runGateWithRetries(
      "smoke",
      maxRetries,
      () => runSmokeGate(config.projectDir, config.port, logger, config.endpoints),
      logger,
      gateRuns,
      traceLogger,
      featureName,
    );
    results.push(smokeResult);

    if (!smokeResult.passed) {
      logger.error("[verification] Smoke gate failed after retries");
      return buildResult(results, gateRuns, startMs);
    }
  }

  // Gate 4: Playwright (optional)
  if (!config.skipPlaywright && config.playwrightConfig) {
    const pwConfig: PlaywrightGateConfig = {
      ...config.playwrightConfig,
      port: config.port,
    };

    const playwrightResult = await runGateWithRetries(
      "playwright",
      1,
      () => runPlaywrightGate(pwConfig, logger),
      logger,
      gateRuns,
      traceLogger,
      featureName,
    );
    results.push(playwrightResult);
  }

  const totalDurationMs = Math.round(performance.now() - startMs);
  logger.info(`[verification] Pipeline complete in ${totalDurationMs}ms`);

  return buildResult(results, gateRuns, startMs);
}

async function runGateWithRetries(
  gateName: string,
  maxRetries: number,
  runFn: () => Promise<IVerificationResult>,
  logger: Logger,
  gateRuns: GateRun[],
  traceLogger?: TraceLogger,
  featureName?: string,
): Promise<IVerificationResult> {
  let lastResult: IVerificationResult | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (attempt > 1) {
      logger.warn(`[verification] ${gateName} retry ${attempt}/${maxRetries}`);
    }

    const step = traceLogger?.startStep(featureName ?? "unknown", `verify-${gateName}`, attempt);

    const result = await runFn();
    lastResult = result;

    gateRuns.push({ gate: gateName, attempt, result });

    if (step) {
      if (!result.passed) {
        for (const err of result.errors) {
          step.addError(err);
        }
      }
      const entry = step.complete(
        result.passed ? "success" : "failed",
        `${gateName} gate attempt ${attempt}: ${result.passed ? "passed" : "failed"}`,
      );
      traceLogger?.recordEntry(entry);
    }

    if (result.passed) {
      return result;
    }
  }

  return lastResult ?? {
    passed: false,
    gate: "all",
    errors: [`${gateName} gate exhausted all retries`],
    warnings: [],
    durationMs: 0,
  };
}

function buildResult(
  results: IVerificationResult[],
  gateRuns: GateRun[],
  startMs: number,
): VerificationPipelineResult {
  return {
    passed: results.every((r) => r.passed),
    results,
    gateRuns,
    totalDurationMs: Math.round(performance.now() - startMs),
  };
}
