import type { PatchPath, PatchPathStep } from "./patch";
import { PatchType, type Patch } from "./patch";

export type EntityPatchOptimizers<T> = {
  [K in keyof T]?: PropertyPatchOptimizer<T[K]>;
};

export interface PropertyPatchOptimizer<T> {
  /**
   * A predicate (prevValue, newValue) => boolean.
   * If provided, the change will only be recorded if this returns true.
   * Even if the filter returns false, the property is still updated to the new value.
   */
  filter?: (prev: T, next: T) => boolean;

  /**
   * A transform function that takes the "new" value and returns
   * what actually gets recorded in the internal change‐list.
   * The property on the instance is always set to the raw "new" value.
   */
  transform?: (value: T) => T;
}

export class PatchCollectorFactory<Instance extends object> {
  constructor(private optimizers?: EntityPatchOptimizers<Instance>) {}

  /**
   * Create a PatchCollector instance for this entity type.
   */
  create(initialState: Instance): Instance {
    const { optimizers } = this;
    const proxy = new Proxy(initialState, {
      set(target, prop, newValue) {
        let collectedValue = newValue as unknown;
        let shouldCollectValue = true;

        const metaData = getOrCreateInstanceMetaData(proxy);

        if (PatchCollectorFactory.optimize) {
          const { filter = refDiff, transform = passThrough } = (optimizers?.[
            prop as keyof Instance
          ] ?? {}) as PropertyPatchOptimizer<unknown>;

          const prevValue = Reflect.get(target, prop);
          collectedValue = transform(newValue);
          shouldCollectValue = filter(collectedValue, transform(prevValue));
        }

        if (shouldCollectValue) {
          metaData.changes ??= {};
          metaData.changes[String(prop)] = collectedValue;
        }

        return Reflect.set(target, prop, newValue);
      },
      get(target, p, receiver) {
        return Reflect.get(target, p, receiver) as unknown;
      },
    });

    return proxy;
  }

  static optimize = true;
}

/**
 * Flushes all collected changes for @collect‐decorated properties on the given instance.
 */
export function flushInstance(
  instance: object,
  ...path: PatchPathStep[]
): Patch {
  const metaData = instanceMetaData.get(instance);

  if (metaData?.changes) {
    const patch: Patch = [
      [PatchType.Update, path as PatchPath, metaData.changes],
    ];
    delete metaData.changes;
    return patch;
  }
  return [];
}

/**
 * Flushes all collected changes for a record of @collect‐decorated class instances.
 */
export function flushRecord(
  record: Record<string, unknown>,
  ...path: PatchPathStep[]
): Patch {
  const patch: Patch = [];
  const currentIds = new Set(Object.keys(record));
  const metaData = getOrCreateInstanceMetaData(record);
  const previousIds = metaData.previousIds ?? new Set();

  const addedIds = currentIds.difference(previousIds);
  for (const id of addedIds) {
    patch.push([PatchType.Set, [...path, id] as PatchPath, record[id]]);
  }

  const removedIds = previousIds.difference(currentIds);
  for (const id of removedIds) {
    patch.push([PatchType.Remove, [...path, id] as PatchPath]);
  }

  const potentiallyUpdatedIds = previousIds.intersection(currentIds);
  for (const id of potentiallyUpdatedIds) {
    const value = record[id];
    const operations =
      value && typeof value === "object"
        ? flushInstance(value, ...path, id)
        : undefined;
    if (operations?.length) {
      patch.push(...operations);
    }
  }

  metaData.previousIds = currentIds;

  return patch;
}

interface InstanceMetaData {
  changes?: Record<string, unknown>;
  previousIds?: Set<string>;
}

function getOrCreateInstanceMetaData<T extends object>(
  instance: T,
): InstanceMetaData {
  let metaData = instanceMetaData.get(instance);
  if (!metaData) {
    metaData = {};
    instanceMetaData.set(instance, metaData);
  }
  return metaData;
}

const instanceMetaData = new WeakMap<object, InstanceMetaData>();

const passThrough = <T>(v: T): T => v;
const refDiff = <T>(a: T, b: T) => a !== b;
