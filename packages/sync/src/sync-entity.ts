import type { PatchPath, PatchPathStep } from "./patch";
import { PatchType, type Patch } from "./patch";

export abstract class SyncEntity {}

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
        const collectedProperties = getOrCreateFromInstance(
          this,
          symbols.collectedProperties,
          () => new Set<PropertyKey>(),
        );
        collectedProperties.add(context.name);
        return initialValue;
      },
      get() {
        return value.get.call(this);
      },
      set(newValue) {
        let collectedValue = newValue;
        let shouldCollectValue = true;

        const assignedProperties = getOrCreateFromInstance(
          this,
          symbols.assignedProperties,
          () => new Set<PropertyKey>(),
        );

        // We can't guarantee that the prevValue exists until a value has been assigned at least once.
        if (shouldOptimizeCollects && assignedProperties.has(context.name)) {
          const prevValue = value.get.call(this);
          collectedValue = transform(newValue);
          shouldCollectValue = filter(collectedValue, transform(prevValue));
        }

        if (shouldCollectValue) {
          const instanceChanges = getOrCreateFromInstance(
            this,
            symbols.instanceChanges,
            () => ({}) as Record<string, unknown>,
          );
          instanceChanges[String(context.name)] = collectedValue;
        }

        value.set.call(this, newValue);
        assignedProperties.add(context.name);
      },
    };
  };
}

const symbols = {
  collectedProperties: Symbol("collectedPropertyNames"),
  assignedProperties: Symbol("assignedProperties"),
  previouslyFlushedKeys: Symbol("previouslyFlushedRecordKeys"),
  instanceChanges: Symbol("instanceChanges"),
  objectChangeHandlers: Symbol("objectChangeHandlers"),
};

function getFromInstance<T>(instance: object, symbol: symbol): T | undefined {
  if (Reflect.has(instance, symbol)) {
    return Reflect.get(instance, symbol) as T;
  }
}

function getOrCreateFromInstance<T>(
  instance: object,
  symbol: symbol,
  defaultValue: () => T,
): T {
  let value = Reflect.get(instance, symbol) as T | undefined;
  if (value === undefined) {
    value = defaultValue();
    Reflect.set(instance, symbol, value);
  }
  return value;
}

/**
 * Flushes all collected changes for @collect‐decorated properties on the given instance.
 * Also emits the changes to all subscribed event handlers.
 */
export function flushObject(instance: object, ...path: PatchPathStep[]): Patch {
  const changes = Reflect.get(instance, symbols.instanceChanges) as
    | object
    | undefined;

  if (changes) {
    const patch: Patch = [[PatchType.Update, path as PatchPath, changes]];
    Reflect.set(instance, symbols.instanceChanges, undefined);
    const eventHandlers = getFromInstance<Set<ObjectChangeHandler<object>>>(
      instance,
      symbols.objectChangeHandlers,
    );
    if (eventHandlers) {
      for (const handler of eventHandlers) {
        handler(changes);
      }
    }
    return patch;
  }

  return [];
}

/**
 * Subscribes to changes on a class instance that has @collect‐decorated properties.
 */
export function subscribeToObject<T extends object>(
  instance: T,
  eventHandler: ObjectChangeHandler<T>,
) {
  const eventHandlers = getOrCreateFromInstance(
    instance,
    symbols.objectChangeHandlers,
    () => new Set<ObjectChangeHandler<T>>(),
  );

  eventHandlers.add(eventHandler);
  return function unsubscribe() {
    eventHandlers.delete(eventHandler);
  };
}

/**
 * Selects the subset of properties that are collectable.
 */
export function selectCollectableSubset<T extends object>(
  instance: T,
): Partial<T> {
  const propertyNames = getFromInstance<Set<string>>(
    instance,
    symbols.collectedProperties,
  );

  if (!propertyNames) {
    return {} as Partial<T>;
  }

  const subset = Object.fromEntries(
    Array.from(propertyNames).map((name) => [name, instance[name as keyof T]]),
  );

  return subset as Partial<T>;
}

let shouldOptimizeCollects = true;

const passThrough = <T>(v: T): T => v;
const refDiff = <T>(a: T, b: T) => a !== b;

export function isPatchOptimizerEnabled(): boolean {
  return shouldOptimizeCollects;
}

export function setPatchOptimizerEnabled(enabled: boolean): void {
  shouldOptimizeCollects = enabled;
}

export type ObjectChangeHandler<T> = (changes: Partial<T>) => unknown;
