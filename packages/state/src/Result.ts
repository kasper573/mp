export class Result<V, E = unknown> {
  constructor(private state: ResultState<V, E>) {}

  get value(): unknown {
    return this.state.ok ? this.state.value : undefined;
  }

  get error(): unknown {
    return this.state.ok ? undefined : this.state.error;
  }

  unwrap(fallback: (error: E) => V): V {
    return this.state.ok ? this.state.value : fallback(this.state.error);
  }

  unwrapErr(fallback: (value: V) => E): E {
    return !this.state.ok ? this.state.error : fallback(this.state.value);
  }

  assert(
    panic = (error: E): unknown => {
      throw error;
    },
  ): V {
    if (!this.state.ok) {
      panic(this.state.error);
      throw new Error(
        `Result assertion panic function failed to exit process. Error was: ${this.state.error}`,
      );
    }
    return this.state.value;
  }

  isOk(): this is Ok<V> {
    return this.state.ok;
  }

  isErr(): this is Err<E> {
    return !this.state.ok;
  }
}

export type ResultState<T, E = unknown> = Ok<T> | Err<E>;
export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };

export function ok<T, E>(value: T): Result<T, E> {
  return new Result({ ok: true, value });
}

export function err<T, E>(error: E): Result<T, E> {
  return new Result({ ok: false, error });
}
