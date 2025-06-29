import {
  type PatchPathStep,
  type Patch,
  PatchType,
  type PatchPath,
} from "./patch";
import { SyncEntity } from "./sync-entity";

export class SyncMap<K, V> extends Map<K, V> {
  #keysLastFlush = new Set<K>();
  #subscribers = new Set<SyncMapChangeHandler<K, V>>();

  // Cannot be a private field because it needs to be accessed by the `set` method,
  // which is an override and can thus not access private fields of the parent class.
  dirtyKeys?: Set<K>;

  override set(key: K, value: V): this {
    this.dirtyKeys ??= new Set();
    this.dirtyKeys.add(key);
    return super.set(key, value);
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
      this.emit({ type: "add", key: key, value });
    }

    const removedKeys = this.#keysLastFlush.difference(currentKeys);
    for (const key of removedKeys) {
      patch.push([PatchType.Remove, [...path, String(key)] as PatchPath]);
      this.emit({ type: "remove", key: key });
    }

    const staleKeys = this.#keysLastFlush.intersection(currentKeys);
    for (const key of staleKeys) {
      const v = this.get(key) as V;
      const op = v instanceof SyncEntity ? v.flush(...path, String(key)) : null;
      if (op?.length) {
        patch.push(...op);
      }
      if (this.dirtyKeys?.has(key)) {
        this.emit({ type: "update", key: key, value: v });
      }
    }

    this.#keysLastFlush = currentKeys;
    this.dirtyKeys?.clear();

    return patch;
  }

  emit(event: SyncMapChangeEvent<K, V>) {
    for (const handler of this.#subscribers) {
      handler(event);
    }
  }

  subscribe(handler: SyncMapChangeHandler<K, V>) {
    this.#subscribers.add(handler);
    return () => {
      this.#subscribers.delete(handler);
    };
  }
}

export type SyncMapChangeEvent<Key, Value> =
  | { type: "add"; key: Key; value: Value }
  | { type: "update"; key: Key; value: Value }
  | { type: "remove"; key: Key };

export type SyncMapChangeHandler<Key, Value> = (
  event: SyncMapChangeEvent<Key, Value>,
) => unknown;
