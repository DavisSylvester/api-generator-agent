import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';

export async function readAllCodeFiles(dirPath: string): Promise<Result<Map<string, string>, Error>> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const files = new Map<string, string>();

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.mts')) {
        const fullPath = join(dirPath, entry.name);
        const content = await Bun.file(fullPath).text();
        files.set(entry.name, content);
      }
    }

    return ok(files);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
