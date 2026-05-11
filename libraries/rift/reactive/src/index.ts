import {
  batch,
  computed,
  signal,
  type ReadonlySignal,
  type Signal,
} from "@preact/signals-core";
import {
  type EntityId,
  type QueryView,
  type RiftSchema,
  World,
} from "@rift/core";
import type { InferValue, RiftType } from "@rift/types";

// World variant whose read methods auto-subscribe to the relevant
// structure/pool version signals when called inside a reactive scope
// (e.g. the callback of `computed`, `effect`, or `ReactiveWorld.memo`).
// Outside a reactive scope the reads behave exactly like `World`.
export class ReactiveWorld extends World {
  static memo<T>(
    compute: (w: ReactiveWorld) => T,
  ): (w: ReactiveWorld) => ReadonlySignal<T> {
    const cache = new WeakMap<ReactiveWorld, ReadonlySignal<T>>();
    return (w) => {
      let cached = cache.get(w);
      if (!cached) {
        cached = computed(() => compute(w));
        cache.set(w, cached);
      }
      return cached;
    };
  }

  readonly #structureVersion = signal(0);
  readonly #poolVersions = new Map<RiftType, Signal<number>>();

  constructor(schema: RiftSchema) {
    super(schema);
    this.on((event) => {
      switch (event.type) {
        case "entityCreated":
        case "entityDestroyed":
          bump(this.#structureVersion);
          return;
        case "componentAdded":
        case "componentRemoved":
          bump(this.#structureVersion);
          bump(this.#poolVersion(event.component));
          return;
        case "componentChanged":
          bump(this.#poolVersion(event.component));
          return;
      }
    });
  }

  override exists(id: EntityId): boolean {
    void this.#structureVersion.value;
    return super.exists(id);
  }

  override has(
    id: EntityId,
    ...types: readonly [RiftType, ...(readonly RiftType[])]
  ): boolean {
    for (const t of types) {
      void this.#poolVersion(t).value;
    }
    return super.has(id, ...types);
  }

  override get<T>(id: EntityId, type: RiftType<T>): T | undefined;
  override get<
    const Types extends readonly [RiftType, RiftType, ...(readonly RiftType[])],
  >(
    id: EntityId,
    ...types: Types
  ): { [K in keyof Types]: InferValue<Types[K]> | undefined };
  override get(id: EntityId, ...types: readonly RiftType[]): unknown {
    for (const t of types) {
      void this.#poolVersion(t).value;
    }
    if (types.length === 1) {
      return super.get(id, types[0]);
    }
    return super.get(
      id,
      ...(types as readonly [RiftType, RiftType, ...(readonly RiftType[])]),
    );
  }

  override query<const Types extends readonly RiftType[]>(
    ...types: Types
  ): QueryView<Types> {
    void this.#structureVersion.value;
    for (const t of types) {
      void this.#poolVersion(t).value;
    }
    return super.query(...types);
  }

  override transaction<T>(fn: () => T): T {
    return batch(fn);
  }

  // Tracks ONLY structure version — so subscribers don't re-run on
  // value mutations of the matched components, only on membership change.
  override entities(): ReadonlySet<EntityId>;
  override entities(...types: readonly RiftType[]): EntityId[];
  override entities(
    ...types: readonly RiftType[]
  ): ReadonlySet<EntityId> | EntityId[] {
    void this.#structureVersion.value;
    if (types.length === 0) {
      return super.entities();
    }
    const ids: EntityId[] = [];
    // Use super.query so we don't trigger pool-version tracking from
    // our own `query` override.
    for (const [id] of super.query(...types)) {
      ids.push(id);
    }
    return ids;
  }

  #poolVersion(type: RiftType): Signal<number> {
    let v = this.#poolVersions.get(type);
    if (!v) {
      v = signal(0);
      this.#poolVersions.set(type, v);
    }
    return v;
  }
}

function bump(s: Signal<number>): void {
  s.value = s.peek() + 1;
}
