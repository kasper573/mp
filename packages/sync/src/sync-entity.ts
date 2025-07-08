import { abstractObservable, observableValueGetterSymbol } from "@mp/state";
import type { NotifyingObservable } from "@mp/state";
import type { PatchPath, PatchPathStep } from "./patch";
import { PatchType, type Patch } from "./patch";

/**
 * Base class for entities that has fields decorated with @collect.
 */
export abstract class SyncEntity {
  private meta = new SyncEntityMeta();

  /**
   * Triggers event handlers and produces a patch that represents all changes since the last flush.
   */
  flush(...path: PatchPathStep[]): Patch {
    const changes = this.meta.changes;
    if (changes) {
      const patch: Patch = [[PatchType.Update, path as PatchPath, changes]];
      this.meta.changes = undefined;
      this.#observable.$notifySubscribers();
      return patch;
    }

    return [];
  }

  /**
   * Returns a subset of the entity that contains only the properties that are decorated with @collect.
   */
  snapshot(): Partial<this> {
    const subset = Object.fromEntries(
      this.meta.collectedProperties
        .values()
        .map((name) => [name, this[name as keyof this]]),
    );
    return subset as Partial<this>;
  }

  /**
   * Accesses the private metadata of a SyncEntity instance.
   * @internal Should only be used by the collect decorator.
   */
  static accessMeta<Entity extends SyncEntity>(entity: Entity) {
    return entity.meta;
  }

  static shouldOptimizeCollects = false;

  // Mixing in the Observable interface
  // (SyncEntity does not use the implements keyword because we must pass the "this"
  // type to the generic param of Observable, which is impossible with implements,
  // but if we make sure to define the entire interface here, it still counts as
  // implemented thanks to TypeScript's structural typing).
  #observable = abstractObservable<this>(() => this);
  derive: NotifyingObservable<this>["derive"] = (...args) =>
    this.#observable.derive(...args);
  compose: NotifyingObservable<this>["compose"] = (...args) =>
    this.#observable.compose(...args);
  subscribe: NotifyingObservable<this>["subscribe"] = (...args) =>
    this.#observable.subscribe(...args);
  $notifySubscribers: NotifyingObservable<this>["$notifySubscribers"] = (
    ...args
  ) => this.#observable.$notifySubscribers(...args);
  [observableValueGetterSymbol]: NotifyingObservable<this>["get"] = (...args) =>
    this.#observable.get(...args);
}

/**
 * Private metadata for a SyncEntity instance.
 * Is only shared with the collect decorator.
 */
class SyncEntityMeta {
  changes: object | undefined;
  collectedProperties = new Set<PropertyKey>();
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
    value: ClassAccessorDecoratorTarget<T, V>,
    context: ClassAccessorDecoratorContext<T, V>,
  ): ClassAccessorDecoratorResult<T, V> => {
    return {
      init(initialValue) {
        if (!(this instanceof SyncEntity)) {
          throw new TypeError(
            `@collect can only be used on properties of classes that extend SyncEntity.`,
          );
        }
        const meta = SyncEntity.accessMeta(this);
        meta.collectedProperties.add(context.name as keyof T);
        return initialValue;
      },
      get() {
        return value.get.call(this);
      },
      set(newValue) {
        let collectedValue = newValue;
        let shouldCollectValue = true;

        const meta = SyncEntity.accessMeta(this as T & SyncEntity);

        // We can't guarantee that the prevValue exists until a value has been assigned at least once.
        if (
          SyncEntity.shouldOptimizeCollects &&
          meta.assignedProperties.has(context.name as keyof T)
        ) {
          const prevValue = value.get.call(this);
          collectedValue = transform(newValue);
          shouldCollectValue = filter(collectedValue, transform(prevValue));
        }

        if (shouldCollectValue) {
          meta.changes ??= {};
          meta.changes[context.name as keyof typeof meta.changes] =
            collectedValue as never;
        }

        value.set.call(this, newValue);
        meta.assignedProperties.add(context.name as keyof T);
      },
    };
  };
}

const passThrough = <T>(v: T): T => v;
const refDiff = <T>(a: T, b: T) => a !== b;

export type SyncEntityChangeHandler<T> = (changes: Partial<T>) => unknown;
