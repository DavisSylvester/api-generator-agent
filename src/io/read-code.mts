import type { Result } from '../types/result.mts';
import { ok, err } from '../types/result.mts';

export async function readCode(filePath: string): Promise<Result<string, Error>> {
  try {
    const file = Bun.file(filePath);
    const content = await file.text();
    return ok(content);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
