import { computed, type ReadonlySignal } from "./signal";

export function computeSetChanges<T>(
  signal: ReadonlySignal<ReadonlySet<T>>,
): ReadonlySignal<SetChange<T>> {
  let previous: { set: ReadonlySet<T> } | undefined;
  return computed((): SetChange<T> => {
    const set = signal.get();
    const added = previous ? set.difference(previous.set) : set;
    const removed = previous ? previous.set.difference(set) : emptySet;
    previous = { set };
    return Object.freeze({ added, removed });
  });
}

export interface SetChange<T> {
  readonly added: ReadonlySet<T>;
  readonly removed: ReadonlySet<T>;
}

// oxlint-disable-next-line no-explicit-any
const emptySet = Object.freeze(new Set<any>());
