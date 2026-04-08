import { join, relative } from 'node:path';
import { readdir } from 'node:fs/promises';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';

const CODE_EXTENSIONS = new Set([`.mts`, `.ts`, `.json`, `.toml`, `.mjs`]);

export async function readAllCodeFiles(dirPath: string): Promise<Result<Map<string, string>, Error>> {
  try {
    const files = new Map<string, string>();
    await walkDir(dirPath, dirPath, files);
    return ok(files);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

async function walkDir(rootDir: string, currentDir: string, files: Map<string, string>): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await walkDir(rootDir, fullPath, files);
    } else if (entry.isFile()) {
      const ext = entry.name.includes(`.`) ? `.${entry.name.split(`.`).pop()}` : ``;
      if (CODE_EXTENSIONS.has(ext)) {
        const relPath = relative(rootDir, fullPath).replace(/\\/g, `/`);
        const content = await Bun.file(fullPath).text();
        files.set(relPath, content);
      }
    }
  }
}
