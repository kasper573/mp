import {
  computed,
  signal,
  type ReadonlySignal,
  type Signal,
} from "@preact/signals-core";
import {
  type EntityId,
  type QueryRow,
  type RiftSchema,
  World,
} from "@rift/core";
import type { InferValue, RiftType } from "@rift/types";

export class ReactiveWorld extends World {
  static memo<T>(
    compute: (s: WorldSignals) => T,
  ): (s: WorldSignals) => ReadonlySignal<T> {
    const cache = new WeakMap<WorldSignals, ReadonlySignal<T>>();
    return (s) => {
      let cached = cache.get(s);
      if (!cached) {
        cached = computed(() => compute(s));
        cache.set(s, cached);
      }
      return cached;
    };
  }

  readonly #structureVersion = signal(0);
  readonly #poolVersions = new Map<RiftType, Signal<number>>();

  readonly signal: WorldSignals;

  constructor(schema: RiftSchema) {
    super(schema);
    this.signal = new WorldSignals(
      this,
      () => void this.#structureVersion.value,
      (t) => void this.#poolVersion(t).value,
    );
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

  #poolVersion(type: RiftType): Signal<number> {
    let v = this.#poolVersions.get(type);
    if (!v) {
      v = signal(0);
      this.#poolVersions.set(type, v);
    }
    return v;
  }
}

// Mirrors the read-only surface of `World` but every method returns a
// `ReadonlySignal` that updates when the relevant component pool(s) or
// the entity structure change. Use `world.signal.X(...)` whenever you
// need reactive reads; use `world.X(...)` for the imperative one-shot.
export class WorldSignals {
  constructor(
    private readonly world: ReactiveWorld,
    private readonly trackStructure: () => void,
    private readonly trackPool: (type: RiftType) => void,
  ) {}

  exists(id: EntityId): ReadonlySignal<boolean> {
    return computed(() => {
      this.trackStructure();
      return this.world.exists(id);
    });
  }

  has(
    id: EntityId,
    ...types: readonly [RiftType, ...(readonly RiftType[])]
  ): ReadonlySignal<boolean> {
    return computed(() => {
      for (const t of types) this.trackPool(t);
      return this.world.has(id, ...types);
    });
  }

  get<T>(id: EntityId, type: RiftType<T>): ReadonlySignal<T | undefined>;
  get<
    const Types extends readonly [RiftType, RiftType, ...(readonly RiftType[])],
  >(
    id: EntityId,
    ...types: Types
  ): ReadonlySignal<{ [K in keyof Types]: InferValue<Types[K]> | undefined }>;
  get(id: EntityId, ...types: readonly RiftType[]): ReadonlySignal<unknown> {
    return computed(() => {
      for (const t of types) this.trackPool(t);
      if (types.length === 1) {
        return this.world.get(id, types[0]);
      }
      return this.world.get(
        id,
        ...(types as readonly [RiftType, RiftType, ...(readonly RiftType[])]),
      );
    });
  }

  query<const T extends readonly RiftType[]>(
    ...types: T
  ): ReadonlySignal<readonly QueryRow<T>[]> {
    return computed((): readonly QueryRow<T>[] => {
      this.trackStructure();
      for (const t of types) this.trackPool(t);
      return this.world.query(...types).toArray();
    });
  }

  // Like query() but only returns matching entity IDs and only fires when
  // membership changes — component value mutations don't trigger this signal.
  // Useful for reactive collection bindings keyed on EntityId.
  entities(...types: readonly RiftType[]): ReadonlySignal<EntityId[]> {
    return computed((): EntityId[] => {
      this.trackStructure();
      const ids: EntityId[] = [];
      for (const [id] of this.world.query(...types)) ids.push(id);
      return ids;
    });
  }
}

function bump(s: Signal<number>): void {
  s.value = s.peek() + 1;
}
