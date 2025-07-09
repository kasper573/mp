import type { NotifyingObservable, ObservableLike } from "@mp/state";
import { abstractObservable, observableValueGetterSymbol } from "@mp/state";
import {
  type PatchPathStep,
  type Patch,
  PatchType,
  type PatchPath,
} from "./patch";
import { SyncEntity } from "./sync-entity";

export class SyncMap<K, V>
  extends Map<K, V>
  implements ObservableLike<ReadonlyMap<K, V>>
{
  #keysLastFlush = new Set<K>();

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
    }

    const removedKeys = this.#keysLastFlush.difference(currentKeys);
    for (const key of removedKeys) {
      patch.push([PatchType.Remove, [...path, String(key)] as PatchPath]);
    }

    let didCollectionChange = addedKeys.size > 0 || removedKeys.size > 0;

    const staleKeys = this.#keysLastFlush.intersection(currentKeys);
    for (const key of staleKeys) {
      const v = this.get(key) as V;
      const op = v instanceof SyncEntity ? v.flush(...path, String(key)) : null;
      if (op?.length) {
        patch.push(...op);
      }
      if (this.dirtyKeys?.has(key)) {
        didCollectionChange = true;
      }
    }

    this.#keysLastFlush = currentKeys;
    this.dirtyKeys?.clear();

    if (didCollectionChange) {
      this.#observable.$notifySubscribers();
    }

    return patch;
  }

  // Mixing in the Observable interface
  #observable = abstractObservable<ReadonlyMap<K, V>>(() => this);
  derive: NotifyingObservable<ReadonlyMap<K, V>>["derive"] = (...args) =>
    this.#observable.derive(...args);
  compose: NotifyingObservable<ReadonlyMap<K, V>>["compose"] = (...args) =>
    this.#observable.compose(...args);
  subscribe: NotifyingObservable<ReadonlyMap<K, V>>["subscribe"] = (...args) =>
    this.#observable.subscribe(...args);
  $notifySubscribers: NotifyingObservable<
    ReadonlyMap<K, V>
  >["$notifySubscribers"] = (...args) =>
    this.#observable.$notifySubscribers(...args);
  [observableValueGetterSymbol]: NotifyingObservable<ReadonlyMap<K, V>>["get"] =
    (...args) => this.#observable.get(...args);
}

export type SyncMapChangeHandler<K, V> = (
  value: ReadonlyMap<K, V>,
  oldValue: ReadonlyMap<K, V>,
) => void;
