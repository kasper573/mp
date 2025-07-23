import { signal, type Signal } from "@mp/state";
import type { PatchPath, PatchPathStep } from "./patch";
import { PatchType, type Patch } from "./patch";

export function createSyncComponent<Values>(
  initialValues: Values,
  options?: { [K in keyof Values]?: SyncComponentPropertyOptions<Values[K]> },
): SyncComponent<Values> {
  const meta = new SyncComponentMeta();
  const componentInstance = {} as SyncComponent<Values>;

  for (const key in initialValues) {
    Object.defineProperty(
      componentInstance,
      key,
      createPropertyDescriptor(meta, key, initialValues[key], options),
    );
  }

  // Attach a symbol with a reference to the meta object.
  // This can be later used to retrieve the meta object,
  // or to identify an unknown value as a sync component.
  Object.defineProperty(componentInstance, syncComponentMetaSymbol, {
    enumerable: false,
    configurable: false,
    value: meta,
  });

  return componentInstance;
}

/**
 * Produces a patch that represents all changes since the last flush.
 */
export function flushSyncComponent(
  componentInstance: unknown,
  path: PatchPathStep[],
  patch: Patch,
): void {
  const meta = getSyncComponentMeta(componentInstance);
  if (meta) {
    const changes = meta.changes;
    if (changes) {
      patch.push([PatchType.Update, path as PatchPath, changes]);
      meta.changes = undefined;
    }
  }
}

createSyncComponent.shouldOptimizeCollects = true;

export function isSyncComponent(
  target: unknown,
): target is SyncComponent<unknown> {
  return !!getSyncComponentMeta(target);
}

export function getSyncComponentMeta(
  target: unknown,
): SyncComponentMeta | undefined {
  if (target !== null && typeof target === "object") {
    return Reflect.get(target, syncComponentMetaSymbol);
  }
}

const syncComponentMetaSymbol = Symbol("SyncComponentMeta");

export type SyncComponent<Values> = Values & {
  flush(...path: PatchPathStep[]): Patch;
};

function createPropertyDescriptor<Value>(
  meta: SyncComponentMeta,
  name: PropertyKey,
  initialValue: unknown,
  {
    transform = passThrough,
    filter = refDiff,
  }: SyncComponentPropertyOptions<Value> = {},
): TypedPropertyDescriptor<Value> {
  meta.observables[name] ??= signal(initialValue);
  return {
    enumerable: true,
    configurable: false,
    get() {
      const obs = meta.observables[name];
      return obs.value as Value;
    },
    set(newValue) {
      let collectedValue = newValue;
      let shouldCollectValue = true;

      const obs = meta.observables[name] as Signal<Value>;

      // We can't guarantee that the prevValue exists until a value has been assigned at least once.
      if (
        createSyncComponent.shouldOptimizeCollects &&
        meta.assignedProperties.has(name)
      ) {
        const prevValue = obs.value;
        collectedValue = transform(newValue);
        shouldCollectValue = filter(collectedValue, transform(prevValue));
      }

      if (shouldCollectValue) {
        meta.changes ??= {};
        meta.changes[name] = collectedValue;
      }

      obs.value = newValue;
      meta.assignedProperties.add(name);
    },
  };
}

class SyncComponentMeta {
  changes: Record<PropertyKey, unknown> | undefined;
  observables: Record<PropertyKey, Signal<unknown>> = {};
  assignedProperties = new Set<PropertyKey>();
}

export interface SyncComponentPropertyOptions<Value> {
  /**
   * A predicate (prevValue, newValue) => boolean.
   * If provided, the change will only be recorded if this returns true.
   * Even if the filter returns false, the property is still updated to the new value.
   */
  filter?: (prev: Value, next: Value) => boolean;

  /**
   * A transform function that takes the "new" value and returns
   * what actually gets recorded in the internal change list.
   * The property on the instance is always set to the raw "new" value.
   */
  transform?: (value: Value) => Value;
}

const passThrough = <T>(v: T): T => v;
const refDiff = <T>(a: T, b: T) => a !== b;
