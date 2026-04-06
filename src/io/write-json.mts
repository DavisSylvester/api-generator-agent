import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';

export async function writeJson<T>(filePath: string, data: T): Promise<Result<void, Error>> {
  try {
    const dir = join(filePath, '..');
    await mkdir(dir, { recursive: true });
    await Bun.write(filePath, JSON.stringify(data, null, 2));
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
