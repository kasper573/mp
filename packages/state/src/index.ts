import { createSignal, type Setter, type Accessor } from "solid-js";

export * from "neverthrow";

export function createAtom<T>(initial: T): Atom<T> {
  const [get, set] = createSignal(initial);
  return { get, set };
}

export interface Atom<T> {
  get: Accessor<T>;
  set: Setter<T>;
}

export { createEffect, createMemo } from "solid-js";
