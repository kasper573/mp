import { effect, type ReadonlySignal } from "@preact/signals-core";
import type { Entity, RiftType } from "@rift/core";

export interface WatcherDiff {
  readonly changed: boolean;
  readonly blobs: ReadonlyArray<Uint8Array | undefined>;
}

function bytesEqual(
  left: Uint8Array | undefined,
  right: Uint8Array | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (
    left === undefined ||
    right === undefined ||
    left.length !== right.length
  ) {
    return false;
  }
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export class EntityWatcher<TKeyComp extends RiftType<string>> {
  readonly #entity: Entity;
  readonly #keyComponent: TKeyComp;
  readonly #components: ReadonlyArray<RiftType>;
  readonly #trackedTypes: ReadonlyArray<RiftType>;
  readonly #disposeEffect: () => void;
  #dirty = true;
  #key: string;
  #snapshots: Array<Uint8Array | undefined>;

  constructor(
    entity: Entity,
    keyComponent: TKeyComp,
    components: ReadonlyArray<RiftType>,
  ) {
    this.#entity = entity;
    this.#keyComponent = keyComponent;
    this.#components = components;
    this.#trackedTypes = dedupeTypes([keyComponent, ...components]);
    this.#key = entity.get(keyComponent);
    this.#snapshots = components.map(() => undefined);
    this.#disposeEffect = effect(() => {
      for (const type of this.#trackedTypes) {
        const store = entity.components.get(type);
        if (!store) {
          continue;
        }
        void (store.signal as ReadonlySignal<unknown>).value;
        if (!store.fieldSignals) {
          continue;
        }
        for (const fieldSignal of store.fieldSignals.values()) {
          void (fieldSignal as ReadonlySignal<unknown>).value;
        }
      }
      this.#dirty = true;
    });
  }

  get entity(): Entity {
    return this.#entity;
  }

  get key(): string {
    return this.#key;
  }

  isDirty(): boolean {
    return this.#dirty;
  }

  diff(): WatcherDiff {
    const nextKey = this.#entity.has(this.#keyComponent)
      ? this.#entity.get(this.#keyComponent)
      : this.#key;
    this.#key = nextKey;

    let changed = false;
    const blobs = this.#components.map((type, index) => {
      const encoded = this.#entity.has(type)
        ? type.encode(this.#entity.get(type))
        : undefined;
      if (!bytesEqual(this.#snapshots[index], encoded)) {
        changed = true;
      }
      return encoded;
    });

    return { changed, blobs };
  }

  commit(blobs: ReadonlyArray<Uint8Array | undefined>): void {
    this.#snapshots = blobs.map((blob) =>
      blob === undefined ? undefined : blob.slice(),
    );
    this.#dirty = false;
  }

  dispose(): void {
    this.#disposeEffect();
  }
}

function dedupeTypes(types: ReadonlyArray<RiftType>): ReadonlyArray<RiftType> {
  const unique: RiftType[] = [];
  const seen = new Set<RiftType>();
  for (const type of types) {
    if (seen.has(type)) {
      continue;
    }
    seen.add(type);
    unique.push(type);
  }
  return unique;
}
