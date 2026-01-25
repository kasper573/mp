import type { ReadonlySignal } from "@preact/signals-core";
import { Computed } from "@preact/signals-core";

export function computeSetChanges<T>(
  signal: ReadonlySignal<ReadonlySet<T>>,
): ReadonlySignal<SetChange<T>> {
  let previous: { set: ReadonlySet<T> } | undefined;
  return new Computed((): SetChange<T> => {
    const set = signal.value;
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
