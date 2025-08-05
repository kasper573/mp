import { signal, type Signal } from "@mp/state";
import type { Path } from "./path";
import type { Patch } from "./sync-state";

export function defineSyncComponent<Values extends object>(
  nextBuilder: (
    builder: SyncComponentBuilder<{}>,
  ) => SyncComponentBuilder<Values>,
): SyncComponentConstructor<Values> {
  return nextBuilder(new SyncComponentBuilder({})).build();
}

/**
 * This builder pattern exists as a temporary solution before we can start using a @collect decorator (like use used to).
 *
 * Decorators are actually supported in TypeScript and ECMAScript,
 * but various tooling like drizzle-kit and babel and esbuild doesn't support it out of the box,
 * so instead of dealing with the whole mess of polyfilling decorators, we use this builder pattern.
 */
class SyncComponentBuilder<Values extends object> {
  constructor(private definitions: SyncComponentPropertyDefinitions<Values>) {}

  add<Value>({
    filter = refDiff,
    transform = passThrough,
  }: SyncComponentPropertyOptions<Value> = {}): <Name extends PropertyKey>(
    name: Name,
  ) => SyncComponentBuilder<Values & { [K in Name]: Value }> {
    return <Name extends PropertyKey>(name: Name) => {
      const newBuilder = this as SyncComponentBuilder<
        Values & { [K in Name]: Value }
      >;
      newBuilder.definitions[name] = {
        filter,
        transform,
      } as (typeof newBuilder.definitions)[Name];
      return newBuilder;
    };
  }

  build(): SyncComponentConstructor<Values> {
    const definitions = this.definitions;
    class SpecificSyncComponent {
      readonly [syncComponentSymbol] = true;
      #changes: Record<PropertyKey, unknown> | undefined;
      #observables: Record<PropertyKey, Signal<unknown>> = {};

      flush(path: Path = [], patch: Patch = []): Patch {
        if (this.#changes) {
          patch.push({
            op: PatchOpCode.ObjectAssign,
            path,
            changes: this.#changes,
          });
          this.#changes = undefined;
        }
        for (const key in this) {
          const child = this[key as keyof this];
          if (isSyncComponent(child)) {
            child.flush([...path, key], patch);
          }
        }
        return patch;
      }

      /**
       * Returns the subset of the component that is decorated with @collect.
       * Will also include descendant SyncComponent instances (if any).
       */
      snapshot(): Values {
        const snapshot: Record<PropertyKey, unknown> = {};
        // Add property values
        for (const name in definitions) {
          snapshot[name] = this[name as keyof this];
        }
        // Add nested components
        for (const key in this) {
          const child = this[key as keyof this];
          if (isSyncComponent(child)) {
            snapshot[key] = child.snapshot();
          }
        }
        return snapshot as Values;
      }

      constructor(initialValues: Values) {
        for (const name in definitions) {
          const { transform, filter } = definitions[name];
          this.#observables[name] = signal(initialValues[name]);
          Object.defineProperty(this, name, {
            enumerable: false,
            configurable: false,
            get() {
              return this.#observables[name].value;
            },
            set(newValue) {
              let collectedValue = newValue;
              let shouldCollectValue = true;

              const obs = this.#observables[name];

              if (shouldOptimizeCollects.value) {
                const prevValue = obs.value;
                collectedValue = transform(newValue);
                shouldCollectValue = filter(
                  collectedValue,
                  transform(prevValue as never),
                );
              }

              if (shouldCollectValue) {
                this.#changes ??= {};
                this.#changes[name] = collectedValue;
              }

              obs.value = newValue;
            },
          });
        }
      }
    }
    return SpecificSyncComponent as unknown as SyncComponentConstructor<Values>;
  }
}

const syncComponentSymbol = Symbol("syncComponent");

export const shouldOptimizeCollects = signal(false);

export function isSyncComponent<Values>(
  target: unknown,
): target is SyncComponent<Values> {
  return (
    target !== null &&
    typeof target === "object" &&
    Reflect.has(target, syncComponentSymbol)
  );
}

type SyncComponentPropertyDefinitions<Values> = {
  [K in keyof Values]: Required<SyncComponentPropertyOptions<Values[K]>>;
};

interface SyncComponentConstructor<Values> {
  new (initialValues: Values): SyncComponent<Values>;
  $infer: Values;
}

/**
 * Allows collecting changes on fields decorated with @collect.
 */
export type SyncComponent<Values> = Values & {
  flush(path?: Path, patch?: Patch): Patch;
  snapshot(): Values;
};

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
