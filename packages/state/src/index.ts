import { createSignal, type Setter, type Accessor } from "solid-js";
import { enableMapSet } from "immer";

enableMapSet();

export * from "neverthrow";
export { createStore, type Store } from "solid-js/store";

export function atom<T>(initial: T): Atom<T> {
  const [get, set] = createSignal(initial);
  return { get, set };
}

export { createMemo as computed, batch } from "solid-js";
export { produce, type Patch } from "immer";

export interface Atom<T> {
  get: Accessor<T>;
  set: Setter<T>;
}

export type Computed<T> = () => T;
