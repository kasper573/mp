// oxlint-disable no-explicit-any
import type { Signal } from "@mp/state";
import { signal as createSignal } from "@mp/state";
import { assert, type Branded } from "@mp/std";

export function tracked<T extends { new (...args: any[]): {} }>(Base: T): T {
  return class Tracked extends Base {
    [syncMemorySymbol]: TrackMemory;
    constructor(...args: any[]) {
      super(...args);

      const memory = new TrackMemory();
      this[syncMemorySymbol] = memory;
      for (const key in this) {
        const value = this[key];
        const child = getSyncMemory(value);
        if (child) {
          child.hoist(memory, key);
          break;
        }

        // We store the pointer on the signal so that we can change it later when hoisting

        const signal = createSignal(value) as SignalWithPointer<unknown>;
        signal.pointer = key as unknown as JsonPointer;
        memory.signals[signal.pointer] = signal;

        Object.defineProperty(this, key, {
          configurable: false,
          enumerable: true,
          get: () => signal.value,
          set: (newValue) => {
            signal.value = newValue;
            memory.dirty.add(signal.pointer);
          },
        });
      }
    }
  };
}

interface SignalWithPointer<T> extends Signal<T> {
  pointer: JsonPointer;
}

class TrackMemory {
  signals: Record<JsonPointer, SignalWithPointer<unknown>> = {};
  dirty = new Set<JsonPointer>();

  hoist(to: TrackMemory, parentKey: string): void {
    for (const signal of Object.values(this.signals)) {
      signal.pointer = joinPointers(parentKey, signal.pointer);
      to.signals[signal.pointer] = signal;
    }
    this.signals = {}; // Empty local signals record since they're all now hoisted
    this.dirty = to.dirty; // Use the parents dirty set
  }
}

const syncMemorySymbol = Symbol("SyncMemory");

function getSyncMemory(target: unknown): TrackMemory | undefined {
  return (
    target &&
    typeof target === "object" &&
    Reflect.get(target, syncMemorySymbol)
  );
}

export function flushTrackedInstance<Target>(
  target: Target,
): TrackedInstanceFlush | undefined {
  const memory = getSyncMemory(target);
  if (!memory?.dirty.size) {
    return;
  }

  const changes: TrackedInstanceFlush = [];
  for (const key of memory.dirty) {
    changes.push([key, memory.signals[key].value]);
  }

  memory.dirty.clear();
  return changes;
}

export function updateTrackedInstance<Target>(
  target: Target,
  changes: TrackedInstanceFlush,
): void {
  const memory = assert(
    getSyncMemory(target),
    "Target is not an instance decorated with @tracked",
  );
  for (const [ptr, value] of changes) {
    memory.signals[ptr].value = value;
  }
}

type JsonPointer = Branded<string, "JsonPointer">;

export type TrackedInstanceFlush = Array<[JsonPointer, unknown]>;

function joinPointers(a: string, b: string): JsonPointer {
  if (!a && !b) {
    return "" as JsonPointer;
  }
  if (!a) {
    return b as JsonPointer;
  }
  if (!b) {
    return a as JsonPointer;
  }
  return (a + "/" + b) as JsonPointer;
}
