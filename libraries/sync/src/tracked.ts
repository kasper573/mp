// oxlint-disable no-explicit-any
import { addEncoderExtension } from "@mp/encoding";
import type { Signal } from "@mp/state";
import { signal as createSignal } from "@mp/state";
import { assert, type Branded } from "@mp/std";

export function tracked(tag: number) {
  return function createTrackedClass<T extends { new (...args: any[]): {} }>(
    Base: T,
  ): T {
    class Tracked extends Base {
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
          memory.signals.set(signal.pointer, signal);

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
    }

    addEncoderExtension<Tracked, FlatTrackedValues>({
      Class: Tracked,
      encode(tracked, encode) {
        const memory = getSyncMemory(tracked) as TrackMemory;
        return encode(
          memory.signals
            .entries()
            .map(([ptr, signal]) => [ptr, signal.value] as const)
            .toArray(),
        );
      },
      decode(values) {
        const instance = new Tracked();
        updateTrackedInstance(instance, values);
        return instance;
      },
      tag,
    });

    return Tracked;
  };
}

interface SignalWithPointer<T> extends Signal<T> {
  pointer: JsonPointer;
}

class TrackMemory {
  signals = new Map<JsonPointer, SignalWithPointer<unknown>>();
  dirty = new Set<JsonPointer>();

  hoist(to: TrackMemory, parentKey: string): void {
    for (const signal of this.signals.values()) {
      signal.pointer = joinPointers(parentKey, signal.pointer);
      to.signals.set(signal.pointer, signal);
    }
    this.signals.clear(); // Empty local signals record since they're all now hoisted
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
): FlatTrackedValues | undefined {
  const memory = getSyncMemory(target);
  if (!memory?.dirty.size) {
    return;
  }

  const changes: FlatTrackedValues = [];
  for (const key of memory.dirty) {
    changes.push([key, memory.signals.get(key)?.value]);
  }

  memory.dirty.clear();
  return changes;
}

export function updateTrackedInstance<Target>(
  target: Target,
  changes: Readonly<FlatTrackedValues>,
): void {
  const memory = assert(
    getSyncMemory(target),
    "Target is not an instance decorated with @tracked",
  );
  for (const [ptr, value] of changes) {
    const signal = assert(
      memory.signals.get(ptr),
      `No signal found for pointer ${ptr}`,
    );
    signal.value = value;
  }
}

type JsonPointer = Branded<string, "JsonPointer">;

/**
 * The entire hierarchy of values inside the tracked instance,
 * flattened into a single list of [JsonPointer, value] pairs.
 */
export type FlatTrackedValues = Array<readonly [JsonPointer, unknown]>;

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
