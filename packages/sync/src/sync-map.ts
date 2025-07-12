import { NotifiableSignal } from "@mp/state";
import {
  type PatchPathStep,
  type Patch,
  PatchType,
  type PatchPath,
} from "./patch";
import { SyncEntity } from "./sync-entity";

export class SyncMap<K, V> implements Map<K, V> {
  #keysLastFlush = new Set<K>();
  #signal: NotifiableSignal<Map<K, V>>;

  constructor(entries?: Iterable<readonly [K, V]> | null) {
    this.#signal = new NotifiableSignal(new Map<K, V>(entries));
  }

  // Reactive Map implementation

  clear(): void {
    const map = this.#signal.value;
    if (map.size > 0) {
      map.clear();
      this.#signal.notify();
    }
  }
  delete(key: K): boolean {
    const deleted = this.#signal.value.delete(key);
    if (deleted) {
      this.#signal.notify();
    }
    return deleted;
  }
  forEach<ThisArg>(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: ThisArg,
  ): void {
    // eslint-disable-next-line unicorn/no-array-for-each
    this.#signal.value.forEach(callbackfn, thisArg);
  }
  get(key: K): V | undefined {
    return this.#signal.value.get(key);
  }
  has(key: K): boolean {
    return this.#signal.value.has(key);
  }
  set(key: K, value: V): this {
    this.#signal.value.set(key, value);
    this.#signal.notify();
    return this;
  }
  get size(): number {
    return this.#signal.value.size;
  }
  entries(): MapIterator<[K, V]> {
    return this.#signal.value.entries();
  }
  keys(): MapIterator<K> {
    return this.#signal.value.keys();
  }
  values(): MapIterator<V> {
    return this.#signal.value.values();
  }
  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#signal.value[Symbol.iterator]();
  }
  get [Symbol.toStringTag](): string {
    return this.#signal.value[Symbol.toStringTag];
  }

  /**
   * Produces a patch that represents all changes since the last flush.
   */
  flush(...path: PatchPathStep[]): Patch {
    const patch: Patch = [];
    const currentKeys = new Set(this.keys());

    const addedKeys = currentKeys.difference(this.#keysLastFlush);
    for (const key of addedKeys) {
      const value = this.get(key) as V;
      patch.push([PatchType.Set, [...path, String(key)] as PatchPath, value]);
    }

    const removedKeys = this.#keysLastFlush.difference(currentKeys);
    for (const key of removedKeys) {
      patch.push([PatchType.Remove, [...path, String(key)] as PatchPath]);
    }

    const staleKeys = this.#keysLastFlush.intersection(currentKeys);
    for (const key of staleKeys) {
      const v = this.get(key) as V;
      const op = v instanceof SyncEntity ? v.flush(...path, String(key)) : null;
      if (op?.length) {
        patch.push(...op);
      }
    }

    this.#keysLastFlush = currentKeys;

    return patch;
  }
}

export type SyncMapChangeHandler<K, V> = (
  value: ReadonlyMap<K, V>,
  oldValue: ReadonlyMap<K, V>,
) => void;
