import type { NotifyableSignal } from "@mp/state";
import { notifyableSignal } from "@mp/state";
import {
  type PatchPathStep,
  type Patch,
  PatchType,
  type PatchPath,
} from "./patch";
import { SyncEntity } from "./sync-entity";

export class SyncMap<K, V> implements Map<K, V> {
  #keysLastFlush = new Set<K>();
  #observable: NotifyableSignal<Map<K, V>>;

  constructor(entries?: Iterable<readonly [K, V]> | null) {
    this.#observable = notifyableSignal(new Map<K, V>(entries));
  }

  clear(): void {
    const map = this.#observable.get();
    if (map.size > 0) {
      map.clear();
      this.#observable.notify();
    }
  }
  delete(key: K): boolean {
    const deleted = this.#observable.get().delete(key);
    if (deleted) {
      this.#observable.notify();
    }
    return deleted;
  }
  forEach<ThisArg>(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: ThisArg,
  ): void {
    // eslint-disable-next-line unicorn/no-array-for-each
    this.#observable.get().forEach(callbackfn, thisArg);
  }
  get(key: K): V | undefined {
    return this.#observable.get().get(key);
  }
  has(key: K): boolean {
    return this.#observable.get().has(key);
  }
  set(key: K, value: V): this {
    this.#observable.get().set(key, value);
    this.#observable.notify();
    return this;
  }
  get size(): number {
    return this.#observable.get().size;
  }
  entries(): MapIterator<[K, V]> {
    return this.#observable.get().entries();
  }
  keys(): MapIterator<K> {
    return this.#observable.get().keys();
  }
  values(): MapIterator<V> {
    return this.#observable.get().values();
  }
  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#observable.get()[Symbol.iterator]();
  }
  get [Symbol.toStringTag](): string {
    return this.#observable.get()[Symbol.toStringTag];
  }

  /**
   * Triggers event handlers and produces a patch that represents all changes since the last flush.
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
