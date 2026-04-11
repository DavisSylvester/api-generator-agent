import { join } from 'node:path';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import type { Logger } from 'winston';
import type { CodeFile } from './codegen-agent.mts';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';

export class EslintAgent {

  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public async run(files: readonly CodeFile[], workDir: string): Promise<Result<readonly CodeFile[], Error>> {
    this.logger.info(`[eslint] Starting lint pass on ${files.length} files`);
    const startMs = performance.now();

    // Write minimal ESLint flat config to the workspace
    const eslintConfigContent = [
      `export default [`,
      `  {`,
      `    rules: {`,
      `      "no-console": "error",`,
      `      "prefer-const": "error",`,
      `      "no-var": "error",`,
      `      "eqeqeq": "error",`,
      `      "curly": "error",`,
      `    },`,
      `  },`,
      `];`,
      ``,
    ].join(`\n`);

    // Ensure workDir exists before writing config
    await mkdir(workDir, { recursive: true });
    await writeFile(join(workDir, `eslint.config.mjs`), eslintConfigContent, `utf-8`);

    const linted: CodeFile[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const file of files) {
      const result = await this.lintFile(file, workDir);
      if (result.ok) {
        linted.push(result.value);
        successCount++;
      } else {
        this.logger.warn(`[eslint] Lint failed for ${file.path}, using original: ${result.error.message}`);
        linted.push(file);
        failCount++;
      }
    }

    const durationMs = Math.round(performance.now() - startMs);
    this.logger.info(`[eslint] Lint complete in ${durationMs}ms — ${successCount} passed, ${failCount} failed`);

    return ok(linted);
  }

  private async lintFile(file: CodeFile, workDir: string): Promise<Result<CodeFile, Error>> {
    this.logger.debug(`[eslint] Linting: ${file.path}`);
    try {
      const filePath = join(workDir, file.path);
      const dir = join(filePath, '..');
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, file.content, 'utf-8');

      const proc = Bun.spawn(['bun', 'eslint', '--fix', '--no-error-on-unmatched-pattern', filePath], {
        cwd: workDir,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        this.logger.debug(`[eslint] Warnings/errors for ${file.path}: ${stderr}`);
      } else {
        this.logger.debug(`[eslint] Linted successfully: ${file.path}`);
      }

      const lintedContent = await readFile(filePath, 'utf-8');

      return ok({
        path: file.path,
        content: lintedContent,
      });
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
