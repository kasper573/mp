import {
  type PatchPathStep,
  type Patch,
  PatchType,
  type PatchPath,
} from "./patch";
import { flushObject } from "./patch-collector";

export class SyncMap<K, V> extends Map<K, V> {
  #previouslyFlushedKeys = new Set<K>();
  #subscribers: Set<SyncMapChangeHandler<K, V>> = new Set();

  /**
   * Triggers event handlers and produces a patch thatrepresents all changes since the last flush.
   */
  flush(...path: PatchPathStep[]): Patch {
    const patch: Patch = [];
    const currentKeys = new Set(this.keys());
    const events: SyncMapChangeEvent<K, V>[] = [];

    const addedKeys = currentKeys.difference(this.#previouslyFlushedKeys);
    for (const key of addedKeys) {
      const value = this.get(key) as V;
      patch.push([
        PatchType.Set,
        [...path, key as PatchPathStep] as PatchPath,
        value,
      ]);
      events.push({ type: "add", key: key, value });
    }

    const removedKeys = this.#previouslyFlushedKeys.difference(currentKeys);
    for (const key of removedKeys) {
      patch.push([
        PatchType.Remove,
        [...path, key as PatchPathStep] as PatchPath,
      ]);
      events.push({ type: "remove", key: key });
    }

    const potentiallyUpdatedKeys =
      this.#previouslyFlushedKeys.intersection(currentKeys);
    for (const key of potentiallyUpdatedKeys) {
      const value = this.get(key);
      const operations =
        value && typeof value === "object"
          ? flushObject(value, ...path, String(key))
          : undefined;
      if (operations?.length) {
        patch.push(...operations);
      }
    }

    this.#previouslyFlushedKeys = currentKeys;

    if (events.length > 0) {
      for (const event of events) {
        for (const handler of this.#subscribers) {
          handler(event);
        }
      }
    }

    return patch;
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
  | { type: "remove"; key: Key };

export type SyncMapChangeHandler<Key, Value> = (
  event: SyncMapChangeEvent<Key, Value>,
) => unknown;
