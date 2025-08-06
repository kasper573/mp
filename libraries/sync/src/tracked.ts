// oxlint-disable no-explicit-any
import { addEncoderExtension } from "@mp/encoding";
import { signal as createSignal, signal } from "@mp/state";
import { assert, type Branded } from "@mp/std";

export function object<Values extends object>(
  properties: PropertySchemas<Values>,
): ObjectSchema<Values> {
  return new ObjectSchema(properties);
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
  constructor(public readonly properties: PropertySchemas<Entity>) {
    super();
  }

  create(initialValues: Entity): Entity {
    return new EntityInstance(this, initialValues) as Entity;
  }
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

class EntityInstance<Entity extends object> {
  constructor(schema: ObjectSchema<Entity>, initialValues: Entity) {
    const memory = new EntityMemory(schema);

    Reflect.set(this, entityMemorySymbol, memory);

    Object.keys(schema.properties).forEach((p) => {
      const key = p as keyof Entity;
      const propertySchema = schema.properties[key];

      if (propertySchema instanceof ObjectSchema) {
        // If a tracked child instance is assigned to, we mutate the underlying instance instead
        // And a signal isn't required, only leaf values will be reactive.
        const childInstance = propertySchema.create(initialValues[key]);
        Object.defineProperty(this, key, {
          configurable: false,
          enumerable: true,
          get: () => childInstance,
          set: (newValue) => Object.assign(childInstance, newValue),
        });
        return;
      }

      if (propertySchema instanceof ValueSchema) {
        const signal = createSignal<Entity[typeof key]>(initialValues[key]);
        Object.defineProperty(this, key, {
          configurable: false,
          enumerable: true,
          get: () => signal.value,
          set: (newValue) => {
            const prevValue = signal.value;
            signal.value = newValue;
            if (propertySchema.optimizer.filter(prevValue, newValue)) {
              memory.dirty.add(key);
            }
          },
        });
        return;
      }

      throw new Error("Unexpected schema type");
    });
  }
}

// Deriving a schema from a POJO when decoding is a way to allow us
// to have only a single encoder extension for all entity instances.
// The only caveat is that we cannot look up the exact schema instance,
// but we can estimate it from the shape of the POJO.
// this will give us the same shape, but not the same instance,
// so things like value optimizers will be lost,
// but that should be fine since those are only used on the server.
function deriveSchema<T extends object>(pojo: T): ObjectSchema<T> {
  const properties: Record<string, Schema<unknown>> = {};
  for (const key in pojo) {
    const value = pojo[key];
    if (typeof value === "object" && value !== null) {
      properties[key] = deriveSchema(value);
    } else {
      properties[key] = new ValueSchema();
    }
  }
  return new ObjectSchema(properties) as ObjectSchema<T>;
}

addEncoderExtension<object, DeepPOJO<object>>({
  Class: EntityInstance,
  tag: 99_999, // Special enough to avoid conflicts with other tags
  encode: (instance, encode) =>
    encode(assert(getEntityMemory(instance)).toPOJO(instance)),
  decode: (pojo) => new EntityInstance(deriveSchema(pojo), pojo),
});

const entityMemorySymbol = Symbol("EntityMemory");

class EntityMemory<T extends object> {
  constructor(private schema: ObjectSchema<T>) {}
  dirty = new Set<keyof T>();

  /**
   * Gets ALL values, regardless of whether they are dirty or not.
   */
  toPOJO(target: T): DeepPOJO<T> {
    const pojo = {} as DeepPOJO<T>;

    for (const key in this.schema.properties) {
      const value = target[key];
      const propertySchema = this.schema.properties[key];
      if (propertySchema instanceof ObjectSchema) {
        pojo[key] = getEntityMemory(value as object)?.toPOJO(
          value as object,
        ) as never;
      } else if (propertySchema instanceof ValueSchema) {
        pojo[key] = propertySchema.optimizer.transform(value) as never;
      } else {
        throw new Error("Unexpected schema type");
      }
    }

    return pojo;
  }

  /**
   * Flushes the dirty properties of the target object.
   * Returns a deep partial of the target object with only the dirty properties.
   */
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

const passThrough = <T>(v: T): T => v;
const refDiff = <T>(a: T, b: T) => a !== b;
