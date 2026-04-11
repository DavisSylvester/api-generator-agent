import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { Logger } from "winston";
import type { IRenderedFile } from "../core/interfaces/index.mts";
import type { Result } from "../types/result.mts";
import { ok, err } from "../types/result.mts";

export class FileWriter {

  private readonly outputDir: string;
  private readonly logger: Logger;

  constructor(outputDir: string, logger: Logger) {
    this.outputDir = outputDir;
    this.logger = logger;
  }

  public async writeFile(file: IRenderedFile): Promise<Result<string, Error>> {
    const fullPath = join(this.outputDir, file.path);

    try {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, "utf-8");
      this.logger.info(`[file-writer] Wrote: ${file.path}`);
      return ok(fullPath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[file-writer] Failed to write ${file.path}: ${msg}`);
      return err(error instanceof Error ? error : new Error(msg));
    }
  }

  public async writeFiles(files: IRenderedFile[]): Promise<Result<string[], Error>> {
    const written: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const result = await this.writeFile(file);
      if (result.ok) {
        written.push(result.value);
      } else {
        errors.push(result.error.message);
      }
    }

    if (errors.length > 0) {
      this.logger.warn(`[file-writer] ${errors.length} files failed to write`);
    }

    return ok(written);
  }
}
