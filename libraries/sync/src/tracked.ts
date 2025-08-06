// oxlint-disable no-explicit-any
import { addEncoderExtension } from "@mp/encoding";
import type { Signal } from "@mp/state";
import { signal as createSignal } from "@mp/state";
import { assert, type Branded } from "@mp/std";

export interface TrackedClassOptions<T> {
  optimizers?: {
    [K in keyof T]?: TrackedPropertyOptimizer<T[K]>;
  };
}

export interface TrackedPropertyOptimizer<T> {
  /**
   * A predicate (prevValue, newValue) => boolean.
   * If provided, the change will only be recorded if this returns true.
   * Even if the filter returns false, the property is still updated to the new value.
   */
  filter?: (prev: T, next: T) => boolean;

  /**
   * A transform function that takes the "new" value and returns
   * what actually gets recorded in the internal change list.
   * The property on the instance is always set to the raw "new" value.
   */
  transform?: (value: T) => T;
}

export function tracked<T extends { new (...args: any[]): {} }>(
  tag: number,
  { optimizers }: TrackedClassOptions<InstanceType<T>> = {},
) {
  return function createTrackedClass(Base: T): T {
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

          const signal = createSignal(value) as SignalWithMeta<unknown>;
          signal.pointer = key as unknown as JsonPointer;
          signal.optimizers = {
            filter: refDiff,
            transform: passThrough,
            ...optimizers?.[key],
          } as Required<TrackedPropertyOptimizer<unknown>>;
          memory.signals.set(signal.pointer, signal);

          Object.defineProperty(this, key, {
            configurable: false,
            enumerable: true,
            get: () => signal.value,
            set: (newValue) => {
              const prevValue = signal.value;
              signal.value = newValue;
              if (signal.optimizers.filter(prevValue, newValue)) {
                memory.dirty.add(signal.pointer);
              }
            },
          });
        }
      }
    }

    addEncoderExtension<Tracked, FlatTrackedValues>({
      Class: Tracked,
      encode(tracked, encode) {
        const memory = getSyncMemory(tracked) as TrackMemory;
        return encode(memory.selectFlatValues());
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

interface SignalWithMeta<T> extends Signal<T> {
  pointer: JsonPointer;
  optimizers: Required<TrackedPropertyOptimizer<T>>;
}

class TrackMemory {
  signals = new Map<JsonPointer, SignalWithMeta<unknown>>();
  dirty = new Set<JsonPointer>();

  hoist(to: TrackMemory, parentKey: string): void {
    for (const signal of this.signals.values()) {
      signal.pointer = joinPointers(parentKey, signal.pointer);
      to.signals.set(signal.pointer, signal);
    }
    this.signals.clear(); // Empty local signals record since they're all now hoisted
    this.dirty = to.dirty; // Use the parents dirty set
  }

  selectFlatValues(
    pointers: Iterable<JsonPointer> = this.signals.keys(),
  ): FlatTrackedValues {
    const values: FlatTrackedValues = [];
    for (const ptr of pointers) {
      const signal = assert(
        this.signals.get(ptr),
        `No signal found for pointer ${ptr}`,
      );
      values.push([ptr, signal.optimizers.transform(signal.value)]);
    }
    return values;
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
  if (memory?.dirty.size) {
    const changes = memory.selectFlatValues(memory.dirty);
    memory.dirty.clear();
    return changes;
  }
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

const passThrough = <T>(v: T): T => v;
const refDiff = <T>(a: T, b: T) => a !== b;
