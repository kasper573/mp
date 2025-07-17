import { signal, type Signal } from "@mp/state";
import type { PatchPath, PatchPathStep } from "./patch";
import { PatchType, type Patch } from "./patch";

/**
 * Base class for entities that has fields decorated with @collect.
 */
export abstract class SyncEntity {
  #meta = new SyncEntityMeta();

  /**
   * Produces a patch that represents all changes since the last flush.
   */
  flush(...path: PatchPathStep[]): Patch {
    const changes = this.#meta.changes;
    if (changes) {
      const patch: Patch = [[PatchType.Update, path as PatchPath, changes]];
      this.#meta.changes = undefined;
      return patch;
    }

    return [];
  }

  /**
   * Returns a subset of the entity that contains only the properties that are decorated with @collect.
   */
  snapshot(): Partial<this> {
    const subset = Object.fromEntries(
      Object.keys(this.#meta.observables).map((name) => [
        name,
        this[name as keyof this],
      ]),
    );
    return subset as Partial<this>;
  }

  /**
   * Accesses the private metadata of a SyncEntity instance.
   * @internal Should only be used by the collect decorator.
   */
  static accessMeta(entity: SyncEntity) {
    return entity.#meta;
  }

  static shouldOptimizeCollects = false;
}

/**
 * Private metadata for a SyncEntity instance.
 * Is only shared with the collect decorator.
 */
class SyncEntityMeta {
  changes: Record<PropertyKey, unknown> | undefined;
  observables: Record<PropertyKey, Signal<unknown>> = {};
  assignedProperties = new Set<PropertyKey>();
}

export interface CollectDecoratorOptions<T> {
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

export function collect<V>({
  transform = passThrough,
  filter = refDiff,
}: CollectDecoratorOptions<V> = {}) {
  return <T extends object>(
    instanceValue: ClassAccessorDecoratorTarget<T, V>,
    context: ClassAccessorDecoratorContext<T, V>,
  ): ClassAccessorDecoratorResult<T, V> => {
    return {
      init(initialValue) {
        const meta = SyncEntity.accessMeta(this as SyncEntity);
        meta.observables[context.name] ??= signal(initialValue as unknown);
        return initialValue;
      },
      get() {
        const meta = SyncEntity.accessMeta(this as SyncEntity);
        const obs = meta.observables[context.name];
        return obs.value as V;
      },
      set(newValue) {
        let collectedValue = newValue;
        let shouldCollectValue = true;

        const meta = SyncEntity.accessMeta(this as SyncEntity);
        const obs = meta.observables[context.name] as Signal<V>;

        // We can't guarantee that the prevValue exists until a value has been assigned at least once.
        if (
          SyncEntity.shouldOptimizeCollects &&
          meta.assignedProperties.has(context.name)
        ) {
          const prevValue = obs.value;
          collectedValue = transform(newValue);
          shouldCollectValue = filter(collectedValue, transform(prevValue));
        }

        if (shouldCollectValue) {
          meta.changes ??= {};
          meta.changes[context.name] = collectedValue;
        }

        obs.value = newValue;
        meta.assignedProperties.add(context.name);
      },
    };
  };
}

const passThrough = <T>(v: T): T => v;
const refDiff = <T>(a: T, b: T) => a !== b;

export type SyncEntityChangeHandler<T> = (changes: Partial<T>) => unknown;
