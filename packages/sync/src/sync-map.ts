import type { Atom, ReadonlyAtom } from "@mp/state";
import { atom } from "@mp/state";
import {
  type PatchPathStep,
  type Patch,
  PatchType,
  type PatchPath,
} from "./patch";
import { SyncEntity } from "./sync-entity";

export class SyncMap<K, V> extends Map<K, V> {
  #keysLastFlush = new Set<K>();

  /**
   * Reactive interface for the map
   */
  #atom: Atom<ReadonlyMap<K, V>>;

  get atom(): ReadonlyAtom<ReadonlyMap<K, V>> {
    return this.#atom;
  }

  constructor(...args: ConstructorParameters<typeof Map<K, V>>) {
    super(...args);
    this.#atom = atom(this);
  }

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

    let didUpdateAnItem = false;

    const staleKeys = this.#keysLastFlush.intersection(currentKeys);
    for (const key of staleKeys) {
      const v = this.get(key) as V;
      const op = v instanceof SyncEntity ? v.flush(...path, String(key)) : null;
      if (op?.length) {
        patch.push(...op);
      }
      if (this.dirtyKeys?.has(key)) {
        didUpdateAnItem = true;
      }
    }

    this.#keysLastFlush = currentKeys;
    this.dirtyKeys?.clear();

    if (patch.length > 0 || didUpdateAnItem) {
      console.log("Notifying", this.#atom.lc, "listeners", patch);
      this.#atom.notify();
    }

    return patch;
  }
}

export type SyncMapChangeHandler<K, V> = (
  value: ReadonlyMap<K, V>,
  oldValue: ReadonlyMap<K, V>,
) => void;
