import type { Logger } from 'winston';
import type { Workspace } from '../io/workspace.mts';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface ValidationResult {
  readonly installed: boolean;
  readonly serverStarted: boolean;
  readonly swaggerRendered: boolean;
  readonly screenshotPath?: string;
  readonly errors: readonly string[];
}

export async function validateOutput(
  workspace: Workspace,
  port: number,
  logger: Logger,
): Promise<ValidationResult> {
  const outputDir = workspace.outputDir();
  const errors: string[] = [];
  let installed = false;
  let serverStarted = false;
  let swaggerRendered = false;
  let screenshotPath: string | undefined;
  let serverProc: ReturnType<typeof Bun.spawn> | undefined;

  try {
    // Step 1: Install dependencies
    logger.info(`[validate] Running bun install in ${outputDir}`);
    const installProc = Bun.spawn([`bun`, `install`], {
      cwd: outputDir,
      stdout: `pipe`,
      stderr: `pipe`,
    });
    const installStderr = await new Response(installProc.stderr).text();
    const installExit = await installProc.exited;

    if (installExit !== 0) {
      errors.push(`bun install failed (exit ${installExit}): ${installStderr.substring(0, 500)}`);
      return { installed, serverStarted, swaggerRendered, screenshotPath, errors };
    }
    installed = true;
    logger.info(`[validate] Dependencies installed`);

    // Step 2: Start the server directly (not via bun --watch to avoid child process issues)
    logger.info(`[validate] Starting server on port ${port}`);
    serverProc = Bun.spawn([`bun`, `run`, `src/index.mts`], {
      cwd: outputDir,
      stdout: `pipe`,
      stderr: `pipe`,
      env: { ...Bun.env, PORT: String(port), NODE_ENV: `development` },
    });

    // Step 3: Wait for server health check
    const baseUrl = `http://localhost:${port}`;
    const maxWaitMs = 30_000;
    const pollMs = 1_000;
    const startTime = performance.now();

    while (performance.now() - startTime < maxWaitMs) {
      try {
        const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2_000) });
        if (res.ok) {
          serverStarted = true;
          break;
        }
      } catch {
        // Server not ready yet
      }
      await Bun.sleep(pollMs);
    }

    if (!serverStarted) {
      errors.push(`Server did not respond at ${baseUrl}/health within ${maxWaitMs / 1_000}s`);
      return { installed, serverStarted, swaggerRendered, screenshotPath, errors };
    }
    logger.info(`[validate] Server ready at ${baseUrl}`);

    // Step 4: Use Playwright to navigate to swagger page and take a screenshot.
    // Playwright's chromium.launch() uses pipe IPC which doesn't work under Bun,
    // so we spawn a Node.js subprocess to run the browser automation.
    const swaggerUrl = `${baseUrl}/swagger`;
    logger.info(`[validate] Opening ${swaggerUrl} with Playwright (via Node.js)`);

    const dateStr = new Date().toISOString().split(`T`)[0]!;
    const screenshotName = `${dateStr}-swagger.png`;
    const docsProjectDir = join(workspace.root, `docs`, `project`);
    await mkdir(docsProjectDir, { recursive: true });
    const screenshotDest = join(docsProjectDir, screenshotName);

    try {
      const playwrightScript = `
        const { chromium } = require('playwright');
        (async () => {
          const browser = await chromium.launch({ headless: true, timeout: 30000 });
          const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
          try {
            await page.goto('${swaggerUrl}', { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForTimeout(3000);
            const bodyText = await page.textContent('body');
            const rendered = !!(bodyText && (
              bodyText.toLowerCase().includes('swagger') ||
              bodyText.toLowerCase().includes('openapi') ||
              bodyText.includes('/v1/') ||
              bodyText.includes('/health')
            ));
            await page.screenshot({ path: '${screenshotDest.replace(/\\/g, `\\\\`)}', fullPage: true });
            console.log(JSON.stringify({ rendered, title: await page.title() }));
          } finally {
            await browser.close();
          }
        })();
      `;

      const pwProc = Bun.spawn([`node`, `-e`, playwrightScript], {
        stdout: `pipe`,
        stderr: `pipe`,
        env: { ...Bun.env },
      });

      const [pwStdout, pwStderr] = await Promise.all([
        new Response(pwProc.stdout).text(),
        new Response(pwProc.stderr).text(),
      ]);
      const pwExit = await pwProc.exited;

      if (pwExit === 0 && pwStdout.trim()) {
        const result = JSON.parse(pwStdout.trim()) as { rendered: boolean; title: string };
        swaggerRendered = result.rendered;
        screenshotPath = screenshotDest;

        if (swaggerRendered) {
          logger.info(`[validate] Swagger UI rendered successfully`);
        } else {
          errors.push(`Swagger UI may not have rendered. Page title: "${result.title}"`);
        }
        logger.info(`[validate] Screenshot saved: ${screenshotPath}`);
      } else {
        errors.push(`Playwright process failed (exit ${pwExit}): ${pwStderr.substring(0, 500)}`);
        logger.warn(`[validate] Playwright failed (exit ${pwExit})`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Playwright error: ${msg}`);
      logger.warn(`[validate] Playwright failed: ${msg}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`Validation error: ${msg}`);
    logger.error(`[validate] Error: ${msg}`);
  } finally {
    // Clean up: kill the server process
    if (serverProc) {
      try {
        serverProc.kill();
        await serverProc.exited;
      } catch {
        // Process may have already exited
      }
      logger.info(`[validate] Server process stopped`);
    }
  }

  return { installed, serverStarted, swaggerRendered, screenshotPath, errors };
}
