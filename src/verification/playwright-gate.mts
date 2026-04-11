import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "winston";
import type { IVerificationResult } from "../core/interfaces/index.mts";

export interface PlaywrightGateConfig {
  port: number;
  apiName: string;
  screenshotPath: string;
  timeoutMs?: number;
}

export async function runPlaywrightGate(
  config: PlaywrightGateConfig,
  logger: Logger,
): Promise<IVerificationResult> {
  const startMs = performance.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const timeoutMs = config.timeoutMs ?? 15000;

  logger.info(`[playwright-gate] Verifying Swagger UI at http://localhost:${config.port}/swagger`);

  try {
    const result = await navigateAndScreenshot(config, timeoutMs, logger);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Playwright verification failed: ${msg}`);
  }

  const durationMs = Math.round(performance.now() - startMs);
  logger.info(
    `[playwright-gate] Complete: ${errors.length} errors, ${warnings.length} warnings (${durationMs}ms)`,
  );

  return {
    passed: errors.length === 0,
    gate: "playwright",
    errors,
    warnings,
    durationMs,
  };
}

interface NavigationResult {
  errors: string[];
  warnings: string[];
}

async function navigateAndScreenshot(
  config: PlaywrightGateConfig,
  timeoutMs: number,
  logger: Logger,
): Promise<NavigationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    const url = `http://localhost:${config.port}/swagger`;

    logger.info(`[playwright-gate] Navigating to ${url}`);

    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: timeoutMs,
    });

    if (!response) {
      errors.push("No response received from Swagger URL");
      return { errors, warnings };
    }

    if (!response.ok()) {
      errors.push(`Swagger page returned HTTP ${response.status()}`);
      return { errors, warnings };
    }

    const title = await page.title();
    logger.info(`[playwright-gate] Page title: "${title}"`);

    const titleValid = validateTitle(title, config.apiName);
    if (!titleValid) {
      warnings.push(
        `Page title "${title}" does not contain API name "${config.apiName}"`,
      );
    }

    await ensureScreenshotDir(config.screenshotPath);

    await page.screenshot({
      path: config.screenshotPath,
      fullPage: true,
    });

    logger.info(`[playwright-gate] Screenshot saved to ${config.screenshotPath}`);
  } finally {
    await browser.close();
  }

  return { errors, warnings };
}

function validateTitle(title: string, apiName: string): boolean {
  const normalizedTitle = title.toLowerCase();
  const normalizedApiName = apiName.toLowerCase();
  return normalizedTitle.includes(normalizedApiName) || normalizedTitle.includes("swagger") || normalizedTitle.includes("scalar") || normalizedTitle.includes("api");
}

async function ensureScreenshotDir(screenshotPath: string): Promise<void> {
  await mkdir(dirname(screenshotPath), { recursive: true });
}
