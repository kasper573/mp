import { createSignal, type Setter, type Accessor } from "solid-js";

export { createStore, type Store } from "solid-js/store";

export * from "./create-storage-signal";

export function atom<T>(initial: T): Atom<T> {
  const [get, set] = createSignal(initial);
  return { get, set };
}

export { createMemo as computed, batch } from "solid-js";

export interface Atom<T> {
  get: Accessor<T>;
  set: Setter<T>;
}

export type Computed<T> = () => T;
