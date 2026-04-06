import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';

export async function readJson<T>(filePath: string): Promise<Result<T, Error>> {
  try {
    const file = Bun.file(filePath);
    const data = await file.json() as T;
    return ok(data);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
