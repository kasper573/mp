import { type Accessor, createSignal, type Setter } from "solid-js";

export * from "neverthrow";
export { createStore, type Store } from "solid-js/store";

export function atom<T>(initial: T): Atom<T> {
  const [get, set] = createSignal(initial);
  return { get, set };
}

export { batch, createMemo as computed } from "solid-js";

export interface Atom<T> {
  get: Accessor<T>;
  set: Setter<T>;
}

export type Computed<T> = () => T;
