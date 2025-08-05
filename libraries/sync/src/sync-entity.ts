// oxlint-disable no-explicit-any
import type { Signal } from "@mp/state";
import { signal as createSignal } from "@mp/state";
import { assert, type Branded } from "@mp/std";

export function entity<T extends { new (...args: any[]): {} }>(
  constructor: T,
): T {
  return class extends constructor {
    [syncMemorySymbol]: SyncMemory;
    constructor(...args: any[]) {
      super(...args);

      const memory = new SyncMemory();
      this[syncMemorySymbol] = memory;
      memory.associate(this, "" as JsonPointer);
    }
  };
}

class SyncMemory {
  signals: Record<JsonPointer, Signal<unknown>> = {};
  dirty = new Set<JsonPointer>();
  ptr = "" as JsonPointer;

  associate<T extends object>(instance: T, ptr: JsonPointer): void {
    this.ptr = ptr;
    for (const key in instance) {
      const value = instance[key];
      const child = getSyncMemory(value);
      if (child) {
        child.hoist(this);
        return;
      }

      const signal = createSignal(value);
      this.signals[ptr] = signal;
      Object.defineProperty(instance, key, {
        configurable: true,
        enumerable: true,
        get: () => signal.value,
        set: (newValue) => {
          signal.value = newValue;
          this.dirty.add(ptr);
        },
      });
    }
  }

  hoist(to: SyncMemory): void {}
}

const syncMemorySymbol = Symbol("SyncMemory");

function getSyncMemory(target: unknown): SyncMemory | undefined {
  return (
    target &&
    typeof target === "object" &&
    Reflect.get(target, syncMemorySymbol)
  );
}

export function flushEntity<Entity>(
  target: Entity,
): SyncInstanceFlush | undefined {
  const memory = getSyncMemory(target);
  if (!memory?.dirty.size) {
    return;
  }

  const changes: SyncInstanceFlush = [];
  for (const key of memory.dirty) {
    changes.push([key, memory.signals[key].value]);
  }

  memory.dirty.clear();
  return changes;
}

export function updateEntity<Entity>(
  target: Entity,
  changes: SyncInstanceFlush,
): void {
  const memory = assert(
    getSyncMemory(target),
    "Target is not an instance decorated with @entity",
  );
  for (const [ptr, value] of changes) {
    memory.signals[ptr].value = value;
  }
}

type JsonPointer = Branded<string, "JsonPointer">;

export type SyncInstanceFlush = Array<[JsonPointer, unknown]>;
