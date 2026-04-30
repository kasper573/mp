export interface Ok<V> {
  readonly ok: true;
  readonly value: V;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<V, E> = Ok<V> | Err<E>;

export function ok<V>(value: V): Ok<V> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
