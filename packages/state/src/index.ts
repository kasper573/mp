import { createSignal, type Setter, type Accessor } from "solid-js";

export * from "neverthrow";

export function atom<T>(initial: T): Atom<T> {
  const [get, set] = createSignal(initial);
  return { get, set };
}

export { createMemo as computed } from "solid-js";

export interface Atom<T> {
  get: Accessor<T>;
  set: Setter<T>;
}

export type Computed<T> = () => T;
