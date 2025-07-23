import { signal, type Signal } from "@mp/state";
import type { PatchPath, PatchPathStep } from "./patch";
import { PatchType, type Patch } from "./patch";

class SyncComponentFields {
  protected readonly meta = new SyncComponentMeta();
}

class SyncComponentBuilder<Values extends object> {
  constructor(
    private readonly fields: new (
      initialValues?: Partial<Values>,
    ) => SyncComponentFields,
  ) {}

  add<Name extends PropertyKey, Value>(
    name: Name,
    defaultValue?: Value,
    {
      filter = refDiff,
      transform = passThrough,
    }: SyncComponentPropertyOptions<Value> = {},
  ): SyncComponentBuilder<Values & { [K in Name]: Value }> {
    const hasDefaultValue = arguments.length === 2;
    return new SyncComponentBuilder(
      class extends this.fields {
        constructor(initialValues?: Partial<Values & { [K in Name]: Value }>) {
          super(initialValues);
          let initialValue: Value;

          if (initialValues && name in initialValues) {
            initialValue = initialValues[name] as Value;
          } else if (hasDefaultValue) {
            initialValue = defaultValue as Value;
          } else {
            throw new Error(`Initializer missing for property ${String(name)}`);
          }

          this.meta.observables[name] = signal(initialValue);
        }
        get [name](): Value {
          return this.meta.observables[name].value as Value;
        }
        set [name](newValue: Value) {
          let collectedValue = newValue;
          let shouldCollectValue = true;

          const obs = this.meta.observables[name] as Signal<Value>;

          // We can't guarantee that the prevValue exists until a value has been assigned at least once.
          if (
            shouldOptimizeCollects.value &&
            this.meta.assignedProperties.has(name)
          ) {
            const prevValue = obs.value;
            collectedValue = transform(newValue);
            shouldCollectValue = filter(collectedValue, transform(prevValue));
          }

          if (shouldCollectValue) {
            this.meta.changes ??= {};
            this.meta.changes[name] = collectedValue;
          }

          obs.value = newValue;
          this.meta.assignedProperties.add(name);
        }
      },
    );
  }

  build(): SyncComponentConstructor<Values> {
    class SyncComponent extends this.fields {
      flush(path: PatchPathStep[] = [], patch: Patch = []): Patch {
        const changes = this.meta.changes;
        if (changes) {
          patch.push([PatchType.Update, path as PatchPath, changes]);
          this.meta.changes = undefined;
        }
        flushProperties(this, path, patch);
        return patch;
      }

      /**
       * Returns the subset of the component that is decorated with @collect.
       * Will also include descendant SyncComponent instances (if any).
       */
      snapshot(): Values {
        const snapshot: Record<string, unknown> = Object.fromEntries(
          Object.keys(this.meta.observables).map((name) => [
            name,
            this[name as keyof this],
          ]),
        );
        for (const key in this) {
          const value = this[key];
          if (isSyncComponent(value)) {
            snapshot[key] = value.snapshot();
          }
        }
        return snapshot as Values;
      }
    }

    return SyncComponent as unknown as SyncComponentConstructor<Values>;
  }
}

export function flushObject<T>(
  target: T,
  path: PatchPathStep[] = [],
  patch: Patch = [],
): Patch {
  if (isSyncComponent(target)) {
    return target.flush(path, patch);
  }
  flushProperties(target, path, patch);
  return patch;
}

function flushProperties<T>(
  target: T,
  path: PatchPathStep[] = [],
  patch: Patch = [],
) {
  for (const key in target) {
    const value = target[key];
    if (isSyncComponent(value)) {
      value.flush([...path, key], patch);
    }
  }
}

export const shouldOptimizeCollects = signal(false);

interface SyncComponentConstructor<Values> {
  new (initialValues?: Values): SyncComponent<Values>;
  $infer: Values;
}

export function defineSyncComponent<Values extends object>(
  nextBuilder: (
    builder: SyncComponentBuilder<{}>,
  ) => SyncComponentBuilder<Values>,
): SyncComponentConstructor<Values> {
  return nextBuilder(new SyncComponentBuilder(SyncComponentFields)).build();
}

export function isSyncComponent<Values>(
  target: unknown,
): target is SyncComponent<Values> {
  return (
    target !== null &&
    typeof target === "object" &&
    Reflect.get(target, "meta") instanceof SyncComponentMeta
  );
}

/**
 * Allows collecting changes on fields decorated with @collect.
 */
export type SyncComponent<Values> = Values & {
  flush(path?: PatchPathStep[], patch?: Patch): Patch;
  snapshot(): Values;
};

/**
 * Private metadata for a SyncComponent instance.
 * Is only shared with the collect decorator.
 */
class SyncComponentMeta {
  changes: Record<PropertyKey, unknown> | undefined;
  observables: Record<PropertyKey, Signal<unknown>> = {};
  assignedProperties = new Set<PropertyKey>();
}

export interface SyncComponentPropertyOptions<T> {
  /**
   * A predicate (prevValue, newValue) => boolean.
   * If provided, the change will only be recorded if this returns true.
   * Even if the filter returns false, the property is still updated to the new value.
   */
  filter?: (prev: T, next: T) => boolean;

  /**
   * A transform function that takes the "new" value and returns
   * what actually gets recorded in the internal change list.
   * The property on the instance is always set to the raw "new" value.
   */
  transform?: (value: T) => T;
}

const passThrough = <T>(v: T): T => v;
const refDiff = <T>(a: T, b: T) => a !== b;

export type SyncComponentChangeHandler<T> = (changes: Partial<T>) => unknown;
