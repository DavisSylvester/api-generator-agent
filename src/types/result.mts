import type { Ok } from './ok.mts';
import type { Err } from './err.mts';

export type { Ok } from './ok.mts';
export type { Err } from './err.mts';
export { ok } from './ok.mts';
export { err } from './err.mts';

export type Result<T, E = Error> = Ok<T> | Err<E>;
