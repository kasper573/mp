// oxlint-disable no-explicit-any
import { addEncoderExtension } from "@mp/encoding";
import { signal as createSignal, signal } from "@mp/state";
import { assert, type Branded } from "@mp/std";

export function object<Values extends object>(
  tag: Tag,
  properties: PropertySchemas<Values>,
): ObjectSchema<Values> {
  return new ObjectSchema(tag, properties);
}

export function value<Value>(optimizer?: PatchOptimizer<Value>): Schema<Value> {
  return new ValueSchema(optimizer);
}

abstract class Schema<T> {
  get $infer(): T {
    throw new Error(
      "This property is for typ inference only. Should not be used at runtime",
    );
  }
}

export class ObjectSchema<Entity extends object> extends Schema<Entity> {
  #instanceClass: new () => Entity;

  constructor(
    tag: Tag,
    public readonly properties: PropertySchemas<Entity>,
  ) {
    super();

    this.#instanceClass = class {} as never;

    addEncoderExtension<Entity, DeepPOJO<Entity>>({
      Class: this.#instanceClass,
      tag,
      encode: (instance, encode) =>
        encode(assert(getEntityMemory(instance)).toPOJO(instance)),
      decode: (pojo) => this.create(pojo),
    });
  }

  create(initialValues: Entity): Entity {
    const memory = new EntityMemory(this);
    const instance = new this.#instanceClass();
    Reflect.set(instance, entityMemorySymbol, memory);

    Object.keys(this.properties).forEach((p) => {
      const key = p as keyof Entity;
      const schema = this.properties[key];

      if (schema instanceof ObjectSchema) {
        // If a tracked child instance is assigned to, we mutate the underlying instance instead
        // And a signal isn't required, only leaf values will be reactive.
        const childInstance = schema.create(initialValues[key]);
        Object.defineProperty(instance, key, {
          configurable: false,
          enumerable: true,
          get: () => childInstance,
          set: (newValue) => Object.assign(instance[key] as object, newValue),
        });
        return;
      }

      if (schema instanceof ValueSchema) {
        const signal = createSignal<Entity[typeof key]>(initialValues[key]);
        Object.defineProperty(instance, key, {
          configurable: false,
          enumerable: true,
          get: () => signal.value,
          set: (newValue) => {
            const prevValue = signal.value;
            signal.value = newValue;
            if (schema.optimizer.filter(prevValue, newValue)) {
              memory.dirty.add(key);
            }
          },
        });
        return;
      }

      throw new Error("Unexpected schema type");
    });
    return instance;
  }
}

const entityMemorySymbol = Symbol("EntityMemory");

class EntityMemory<T extends object> {
  constructor(private schema: ObjectSchema<T>) {}
  dirty = new Set<keyof T>();

  toPOJO(target: T): DeepPOJO<T> {
    const pojo = {} as DeepPOJO<T>;

    for (const key in this.schema.properties) {
      const value = target[key];
      if (this.schema.properties[key] instanceof ObjectSchema) {
        pojo[key] = getEntityMemory(value as object)?.toPOJO(
          value as object,
        ) as never;
      } else {
        pojo[key] = value as never;
      }
    }

    return pojo;
  }

  flush(target: T): DeepPartial<T> | undefined {
    const partial = {} as DeepPartial<T>;

    for (const key in this.schema.properties) {
      const propertySchema = this.schema.properties[key];
      const value = target[key];
      if (propertySchema instanceof ObjectSchema) {
        const childPartial = getEntityMemory(value as object)?.flush(
          value as object,
        );
        if (childPartial) {
          partial[key] = childPartial as never;
        }
      } else if (propertySchema instanceof ValueSchema) {
        if (this.dirty.has(key)) {
          partial[key] = propertySchema.optimizer.transform(value);
        }
      } else {
        throw new Error("Unexpected schema type");
      }
    }

    this.dirty.clear();

    if (Object.keys(partial).length) {
      return partial;
    }
  }

  update(target: T, changes: DeepPartial<T>): void {
    for (const key in changes) {
      this.updateKey(target, key as keyof T, changes[key as keyof T]);
    }
  }

  private updateKey<K extends keyof T>(
    target: T,
    key: K,
    newValue: T[K],
  ): void {
    if (this.schema.properties[key] instanceof ObjectSchema) {
      const propMemory = assert(getEntityMemory(target[key] as object));
      propMemory.update(target, newValue as DeepPartial<T[K] & object>);
    } else {
      target[key] = newValue;
    }
  }
}

export type DeepPOJO<T> = Branded<T, "DeepPOJO">;
export type DeepPartial<T> = Branded<T, "DeepPartial">;

export const shouldOptimizeTrackedProperties = signal(true);

function getEntityMemory<T extends object>(
  target: T,
): EntityMemory<T> | undefined {
  return Reflect.get(target, entityMemorySymbol) as EntityMemory<T>;
}

export function flushEntity<Entity extends object>(
  target: Entity,
): DeepPartial<Entity> | undefined {
  return getEntityMemory(target)?.flush(target);
}

export function updateEntity<Entity extends object>(
  target: Entity,
  changes: DeepPartial<Entity>,
): void {
  const mem = assert(getEntityMemory(target), "Target not an entity instance");
  mem.update(target, changes);
}

type PropertySchemas<Values> = {
  readonly [K in keyof Values]: Schema<Values[K]>;
};

class ValueSchema<T> extends Schema<T> {
  public readonly optimizer: Required<PatchOptimizer<T>>;
  constructor({
    filter = refDiff,
    transform = passThrough,
  }: PatchOptimizer<T> = {}) {
    super();
    this.optimizer = {
      filter(prev, next) {
        if (shouldOptimizeTrackedProperties.value) {
          return filter(prev, next);
        }
        return true;
      },
      transform(value) {
        if (shouldOptimizeTrackedProperties.value) {
          return transform(value);
        }
        return value;
      },
    };
  }
}

export interface PatchOptimizer<T> {
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

type Tag = TrackedRegistry extends { tag: infer T } ? T : number;

/**
 * Augment this interface with a `tag` property to specify the type of
 * tag value that must be passed to the `tracked` decorator.
 *
 * Useful if you want ensure it's an enum or a specific type.
 */
export interface TrackedRegistry {}

const passThrough = <T>(v: T): T => v;
const refDiff = <T>(a: T, b: T) => a !== b;
