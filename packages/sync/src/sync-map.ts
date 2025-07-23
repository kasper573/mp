import { NotifiableSignal } from "@mp/state";
import {
  type PatchPathStep,
  type Patch,
  PatchType,
  type PatchPath,
} from "./patch";
import { isSyncComponent } from "./sync-component";

import type { IndexDefinition, IndexResolvers } from "@mp/index";
import { Index } from "@mp/index";

export class SyncMap<K, V, Def extends IndexDefinition = {}>
  implements Map<K, V>
{
  #keysLastFlush = new Set<K>();
  #signal: NotifiableSignal<Map<K, V>>;
  readonly index: Index<V, Def>;

  constructor(
    entries?: Iterable<readonly [K, V]> | null,
    indexResolvers?: IndexResolvers<V, Def>,
  ) {
    this.#signal = new NotifiableSignal(new Map<K, V>(entries));

    this.index = new Index(
      () => this.#signal.value.values(),
      indexResolvers ?? ({} as IndexResolvers<V, Def>),
    );
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
      if (isSyncComponent(v)) {
        v.flush([...path, String(key)], patch);
      }
    }

    this.#keysLastFlush = currentKeys;

    return patch;
  }
}
