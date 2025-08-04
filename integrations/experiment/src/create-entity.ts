import { Signal } from "@mp/state";
import type { Graph } from "./type-graph";

export function createEntity<T>(
  graph: Graph,
  initialData: { nested: T } | { flat: FlatEntity },
): SyncEntity<T> {
  const signals: ComponentSignals = {};
  const dirty = new Set<ComponentId>();

  if ("flat" in initialData) {
    for (const key in initialData.flat) {
      signals[key] = new Signal(initialData.flat[key]);
      dirty.add(key);
    }
  }

  const nestedData = "nested" in initialData ? initialData.nested : undefined;
  const entity = defineProperties(graph, nestedData, "", {
    init(path, resolvedValue) {
      signals[path] ??= new Signal(resolvedValue);
      dirty.add(path);
    },
    get(path) {
      return signals[path].value;
    },
    set(path, value) {
      dirty.add(path);
      signals[path].value = value;
    },
  });

  Object.defineProperties(entity, {
    $flush: {
      value() {
        if (!dirty.size) {
          return;
        }
        const flat: FlatEntity = {};
        for (const key in dirty) {
          flat[key] = signals[key].value;
        }
        dirty.clear();
        return flat;
      },
    },
    $flat: {
      value() {
        const flat: FlatEntity = {};
        for (const key in signals) {
          flat[key] = signals[key].value;
        }
        return flat;
      },
    },
    $apply: {
      value(flat) {
        for (const key in flat) {
          signals[key].value = flat[key];
        }
      },
    },
  } as {
    [K in keyof SyncEntityInternals]: TypedPropertyDescriptor<
      SyncEntityInternals[K]
    >;
  });

  return entity as SyncEntity<T>;
}

export type ComponentSignals = Record<ComponentId, Signal>;

export type ComponentId = string | number;

interface SyncEntityInternals {
  /**
   * Returns the flat representation of component changes since the last flush.
   */
  $flush(): FlatEntity | undefined;
  /**
   * Returns the entire flat entity regardless of whether any component was changed.
   */
  $flat(): FlatEntity;
  /**
   * Updates the entity according to the provided
   */
  $apply(flat: FlatEntity): void;
}

export type SyncEntity<T> = T & SyncEntityInternals;

/**
 * Component values of an entity, made into a flat record regardless of how nested the entity data type is.
 */
export type FlatEntity = Record<ComponentId, unknown>;

function defineProperties<T>(
  graph: Graph,
  data: T | undefined,
  prefix: string,
  ops: {
    init: (path: string, value: unknown) => void;
    get: (path: string) => unknown;
    set: (path: string, value: unknown) => void;
  },
): object {
  const instance: object = {};

  for (const key in graph) {
    const node = graph[key];
    const value = data?.[key as keyof T];
    const path = `${prefix}${String(key)}`;
    if (node) {
      Object.defineProperty(instance, key, {
        enumerable: true,
        configurable: false,
        value: defineProperties(node, value, path + ".", ops),
        writable: false,
      });
    } else {
      ops.init(path, value);
      Object.defineProperty(instance, key, {
        enumerable: true,
        configurable: false,
        get: () => ops.get(path),
        set: (value) => ops.set(path, value),
      });
    }
  }

  return instance;
}
