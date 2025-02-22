import { type Accessor, createSignal, type Setter } from "npm:solid-js";

export { createStore, type Store } from "npm:solid-js/store";

export function atom<T>(initial: T): Atom<T> {
  const [get, set] = createSignal(initial);
  return { get, set };
}

export { batch, createMemo as computed } from "npm:solid-js";

export interface Atom<T> {
  get: Accessor<T>;
  set: Setter<T>;
}

export type Computed<T> = () => T;
