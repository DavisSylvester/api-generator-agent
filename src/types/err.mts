export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
