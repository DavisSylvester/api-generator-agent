import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';

export async function writeCode(filePath: string, content: string): Promise<Result<void, Error>> {
  try {
    const dir = join(filePath, '..');
    await mkdir(dir, { recursive: true });
    await Bun.write(filePath, content);
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
