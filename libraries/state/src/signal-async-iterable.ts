import type { Signal } from "@preact/signals-core";

export function toAsyncIterable<T>(signal: Signal<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      const queue: T[] = [];
      let pendingResolve: ((result: IteratorResult<T>) => void) | null = null;
      let done = false;

      const unsubscribe = signal.subscribe((value: T) => {
        if (done) return;

        if (pendingResolve) {
          pendingResolve({ value, done: false });
          pendingResolve = null;
        } else {
          queue.push(value);
        }
      });

      return {
        next() {
          if (queue.length > 0) {
            // oxlint-disable-next-line no-non-null-assertion
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          if (done) {
            return Promise.resolve({ value: undefined as T, done: true });
          }
          return new Promise((resolve) => {
            pendingResolve = resolve;
          });
        },

        return() {
          done = true;
          unsubscribe();
          if (pendingResolve) {
            pendingResolve({ value: undefined as T, done: true });
            pendingResolve = null;
          }
          return Promise.resolve({ value: undefined as T, done: true });
        },
      };
    },
  };
}
