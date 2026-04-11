import type { Logger } from "winston";
import type { IVerificationResult } from "../core/interfaces/index.mts";

const MAX_RETRIES = 3;

export interface EslintGateConfig {
  maxRetries?: number;
}

export async function runEslintGate(
  projectDir: string,
  logger: Logger,
  config?: EslintGateConfig,
): Promise<IVerificationResult> {
  const startMs = performance.now();
  const maxRetries = config?.maxRetries ?? MAX_RETRIES;

  logger.info(`[eslint-gate] Running ESLint on ${projectDir} (max retries: ${maxRetries})`);

  let lastResult = await runSinglePass(projectDir, logger);
  let attempt = 1;

  while (!lastResult.passed && attempt < maxRetries) {
    attempt++;
    logger.warn(`[eslint-gate] Retry ${attempt}/${maxRetries} — running fix pass`);
    lastResult = await runSinglePass(projectDir, logger);
  }

  const durationMs = Math.round(performance.now() - startMs);

  logger.info(
    `[eslint-gate] Complete after ${attempt} attempt(s): ${lastResult.errors.length} errors, ${lastResult.warnings.length} warnings (${durationMs}ms)`,
  );

  return {
    ...lastResult,
    durationMs,
    metadata: {
      attempts: attempt,
      maxRetries,
    },
  };
}

async function runSinglePass(
  projectDir: string,
  logger: Logger,
): Promise<IVerificationResult> {
  const startMs = performance.now();
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const fixResult = await runFixPass(projectDir);
    if (fixResult.fixedCount > 0) {
      logger.info(`[eslint-gate] Auto-fixed ${fixResult.fixedCount} issue(s)`);
    }

    const checkResult = await runCheckPass(projectDir);
    errors.push(...checkResult.errors);
    warnings.push(...checkResult.warnings);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`ESLint execution failed: ${msg}`);
  }

  const durationMs = Math.round(performance.now() - startMs);

  return {
    passed: errors.length === 0,
    gate: "eslint",
    errors,
    warnings,
    durationMs,
  };
}

interface FixPassResult {
  fixedCount: number;
}

async function runFixPass(projectDir: string): Promise<FixPassResult> {
  const proc = Bun.spawn(
    ["bun", "eslint", "--fix", "src/", "--ext", ".mts"],
    { cwd: projectDir, stdout: "pipe", stderr: "pipe" },
  );
  await proc.exited;

  const stdout = await new Response(proc.stdout).text();
  const fixedMatch = stdout.match(/(\d+)\s+problem.*fixed/);
  const fixedCount = fixedMatch ? parseInt(fixedMatch[1] ?? "0", 10) : 0;

  return { fixedCount };
}

interface CheckPassResult {
  errors: string[];
  warnings: string[];
}

async function runCheckPass(projectDir: string): Promise<CheckPassResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const checkProc = Bun.spawn(
    ["bun", "eslint", "src/", "--ext", ".mts", "--format", "json"],
    { cwd: projectDir, stdout: "pipe", stderr: "pipe" },
  );
  const exitCode = await checkProc.exited;

  if (exitCode !== 0) {
    const stdout = await new Response(checkProc.stdout).text();
    try {
      const results = JSON.parse(stdout) as EslintJsonResult[];
      for (const result of results) {
        for (const msg of result.messages) {
          const entry = `${result.filePath}:${msg.line} [${msg.ruleId}] ${msg.message}`;
          if (msg.severity === 2) {
            errors.push(entry);
          } else {
            warnings.push(entry);
          }
        }
      }
    } catch {
      errors.push(`ESLint exited with code ${exitCode}`);
    }
  }

  return { errors, warnings };
}

interface EslintJsonResult {
  filePath: string;
  messages: EslintMessage[];
}

interface EslintMessage {
  severity: number;
  message: string;
  ruleId: string;
  line: number;
}
