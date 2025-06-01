import type { Branded } from "@mp/std";
import type { PatchPath, PatchPathStep } from "./patch";
import { PatchType, type Patch } from "./patch";

export interface CollectDecoratorOptions<T> {
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

export function collect<V>({
  transform = passThrough,
  filter = refDiff,
}: CollectDecoratorOptions<V> = {}) {
  return <T extends object>(
    value: ClassAccessorDecoratorTarget<T, V>,
    context: ClassAccessorDecoratorContext<T, V>,
  ): ClassAccessorDecoratorResult<T, V> => {
    return {
      init(initialValue) {
        registerCollectedPropertyName(
          classIdentifier(this),
          String(context.name),
        );
        return initialValue;
      },
      get() {
        return value.get.call(this);
      },
      set(newValue) {
        let collectedValue = newValue;
        let shouldCollectValue = true;

        if (shouldOptimizeCollects) {
          const prevValue = value.get.call(this);
          collectedValue = transform(newValue);
          shouldCollectValue = filter(collectedValue, transform(prevValue));
        }

        if (shouldCollectValue) {
          let changes = instanceChanges.get(this) as
            | Record<string, V>
            | undefined;

          if (!changes) {
            changes = {};
            instanceChanges.set(this, changes);
          }
          changes[String(context.name)] = collectedValue;
        }

        value.set.call(this, newValue);
      },
    };
  };
}

/**
 * Flushes all collected changes for @collect‐decorated properties on the given instance.
 */
export function flushClassInstance(
  instance: object,
  ...path: PatchPathStep[]
): Patch {
  const changes = instanceChanges.get(instance);
  if (changes) {
    const patch: Patch = [[PatchType.Update, path as PatchPath, changes]];
    instanceChanges.delete(instance);
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
  const previousIds =
    previouslyFlushedRecordKeys.get(record) ?? new Set<string>();

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
        ? flushClassInstance(value, ...path, id)
        : undefined;
    if (operations?.length) {
      patch.push(...operations);
    }
  }

  previouslyFlushedRecordKeys.set(record, currentIds);

  return patch;
}

/**
 * Selects the subset of properties that are collectable.
 */
export function selectCollectableSubset<T extends object>(
  instance: T,
): Partial<T> {
  const names = collectedPropertyNames.get(classIdentifier(instance)) as
    | Set<keyof T>
    | undefined;

  if (!names) {
    return {};
  }

  const props = Object.fromEntries(
    Array.from(names).map((name) => [name, instance[name]]),
  );

  return props as Partial<T>;
}

const instanceChanges = new WeakMap<object, object>();

/**
 * Key: record instance
 * Value: Set of keys that was flushed last time for this instance.
 */
const previouslyFlushedRecordKeys = new WeakMap<object, Set<string>>();

const collectedPropertyNames = new WeakMap<ClassIdentifier, Set<string>>();

let shouldOptimizeCollects = true;

const passThrough = <T>(v: T): T => v;
const refDiff = <T>(a: T, b: T) => a !== b;
function classIdentifier(instance: object) {
  return instance.constructor as unknown as ClassIdentifier;
}

type ClassIdentifier = Branded<object, "ClassIdentifier">;

function registerCollectedPropertyName(
  id: ClassIdentifier,
  propertyName: string,
): void {
  const names = collectedPropertyNames.get(id);
  if (names) {
    names.add(propertyName);
  } else {
    collectedPropertyNames.set(id, new Set([propertyName]));
  }
}

export function isPatchOptimizerEnabled(): boolean {
  return shouldOptimizeCollects;
}

export function setPatchOptimizerEnabled(enabled: boolean): void {
  shouldOptimizeCollects = enabled;
}
