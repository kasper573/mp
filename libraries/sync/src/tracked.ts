// oxlint-disable no-explicit-any
import { addEncoderExtension } from "@mp/encoding";
import { signal as createSignal, signal } from "@mp/state";
import { assert, type Branded } from "@mp/std";

export const shouldOptimizeTrackedProperties = signal(true);

export function object<T extends object>(
  properties: SchemaShape<T>,
): ObjectSchema<T> {
  return new ObjectSchema(properties);
}

export function prop<T>(optimizer?: PatchOptimizer<T>): Schema<T> {
  return new PropertySchema(optimizer);
}

export function flushTrackedInstance<T extends object>(
  target: T,
): DeepPartial<T> | undefined {
  return getTrackedApi(target)?.flush(target);
}

export function updateTrackedInstance<T extends object>(
  target: T,
  changes: DeepPartial<T>,
): void {
  // Nothing special needs to be done, property descriptors will already handle this.
  Object.assign(target, changes);
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

abstract class Schema<T> {
  get $infer(): T {
    throw new Error(
      "This property is for type inference only. Should not be used at runtime",
    );
  }
}

class ObjectSchema<T extends object> extends Schema<T> {
  constructor(public readonly properties: SchemaShape<T>) {
    super();
  }

  create(initialValues: T): T {
    return new TrackedInstance(this, initialValues) as T;
  }
}

type SchemaShape<T> = {
  readonly [K in keyof T]: Schema<T[K]>;
};

class PropertySchema<T> extends Schema<T> {
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

class TrackedInstance<T extends object> {
  constructor(schema: ObjectSchema<T>, initialValues: T) {
    const trackedApi = new TrackedAPI(schema);
    Reflect.set(this, trackedApiSymbol, trackedApi);

    Object.keys(schema.properties).forEach((p) => {
      const key = p as keyof T;
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

      if (propertySchema instanceof PropertySchema) {
        const signal = createSignal<T[typeof key]>(initialValues[key]);
        Object.defineProperty(this, key, {
          configurable: false,
          enumerable: true,
          get: () => signal.value,
          set: (newValue) => {
            const prevValue = signal.value;
            signal.value = newValue;
            if (propertySchema.optimizer.filter(prevValue, newValue)) {
              trackedApi.dirty.add(key);
            }
          },
        });

        // Consider initial values dirty
        trackedApi.dirty.add(key);
        return;
      }

      throw new Error("Unexpected schema type");
    });
  }
}

// Deriving a schema from a POJO when decoding is a way to allow us
// to have only a single encoder extension for all tracked instances.
// The only caveat is that we cannot look up the exact schema instance,
// but we can estimate it from the shape of the POJO.
// this will give us the same shape, but not the same instance,
// so things like value optimizers will be lost,
// but that should be fine since those are only used on the server.
function deriveSchema<T extends object>(pojo: T): ObjectSchema<T> {
  const properties: Record<string, Schema<unknown>> = {};
  for (const key in pojo) {
    const value = pojo[key];
    if (isPlainObject(value)) {
      properties[key] = deriveSchema(value);
    } else {
      properties[key] = new PropertySchema();
    }
  }
  return new ObjectSchema(properties) as ObjectSchema<T>;
}

addEncoderExtension<object, DeepPOJO<object>>({
  Class: TrackedInstance,
  tag: 99_999, // Special enough to avoid conflicts with other tags
  encode: (instance, encode) =>
    encode(assert(getTrackedApi(instance)).toPOJO(instance)),
  decode: (pojo) => new TrackedInstance(deriveSchema(pojo), pojo),
});

const trackedApiSymbol = Symbol("TrackedApi");

/**
 * The tracked API is essentially methods that conceptually ought to exist on the tracked instance,
 * but we cannot add them there since they may conflict with user-defined properties.
 * So the tracked api lives on a symbol on the instance,
 * but in all other aspects behaves like normal instance methods,
 * except that they receive the instance as function argument instead of using  `this`.
 */
class TrackedAPI<T extends object> {
  constructor(private schema: ObjectSchema<T>) {}
  dirty = new Set<keyof T>();

  /**
   * Gets ALL values, regardless of whether they are dirty or not.
   */
  toPOJO(instance: T): DeepPOJO<T> {
    const pojo = {} as DeepPOJO<T>;

    for (const key in this.schema.properties) {
      const value = instance[key];
      const propertySchema = this.schema.properties[key];
      if (propertySchema instanceof ObjectSchema) {
        pojo[key] = getTrackedApi(value as object)?.toPOJO(
          value as object,
        ) as never;
      } else if (propertySchema instanceof PropertySchema) {
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
  flush(instance: T): DeepPartial<T> | undefined {
    const partial = {} as DeepPartial<T>;

    for (const key in this.schema.properties) {
      const propertySchema = this.schema.properties[key];
      const value = instance[key];
      if (propertySchema instanceof ObjectSchema) {
        const childPartial = getTrackedApi(value as object)?.flush(
          value as object,
        );
        if (childPartial) {
          partial[key] = childPartial as never;
        }
      } else if (propertySchema instanceof PropertySchema) {
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
}

type DeepPOJO<T> = Branded<T, "DeepPOJO">;
export type DeepPartial<T> = Branded<T, "DeepPartial">;

function getTrackedApi<T extends object>(target: T): TrackedAPI<T> | undefined {
  return Reflect.get(target, trackedApiSymbol) as TrackedAPI<T>;
}

const passThrough = <T>(v: T): T => v;
const refDiff = <T>(a: T, b: T) => a !== b;

function isPlainObject(value: unknown): value is object {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
