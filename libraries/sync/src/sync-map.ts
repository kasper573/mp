import type { Patch, PathSegment } from "@mp/patch";
import { PatchOpCode } from "@mp/patch";
import { NotifiableSignal } from "@mp/state";
import { isSyncComponent } from "./sync-component";

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
  flush(path: PathSegment[] = [], patch: Patch = []): Patch {
    const currentKeys = new Set(this.keys());

    const addedKeys = currentKeys.difference(this.#keysLastFlush);
    for (const key of addedKeys) {
      patch.push({
        op: PatchOpCode.MapSet,
        path,
        key: String(key),
        value: this.get(key),
      });
    }

    const removedKeys = this.#keysLastFlush.difference(currentKeys);
    for (const key of removedKeys) {
      patch.push({
        op: PatchOpCode.MapDelete,
        path,
        key: String(key),
      });
    }

    const staleKeys = this.#keysLastFlush.intersection(currentKeys);
    for (const key of staleKeys) {
      const v = this.get(key);
      if (isSyncComponent(v)) {
        v.flush([...path, String(key)], patch);
      }
    }

    this.#keysLastFlush = currentKeys;

    return patch;
  }
}
