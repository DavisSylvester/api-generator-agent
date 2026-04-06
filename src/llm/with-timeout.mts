export class LlmTimeoutError extends Error {

  public readonly timeoutMs: number;
  public readonly model: string;

  constructor(model: string, timeoutMs: number) {
    super(`Model "${model}" timed out after ${Math.round(timeoutMs / 1000)}s`);
    this.name = 'LlmTimeoutError';
    this.timeoutMs = timeoutMs;
    this.model = model;
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  model: string,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new LlmTimeoutError(model, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (e) {
    clearTimeout(timeoutId!);
    throw e;
  }
}
