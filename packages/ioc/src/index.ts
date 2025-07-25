import type { Result } from "@mp/std";
import { err, ok } from "@mp/std";

export abstract class InjectionContainer {
  constructor(protected map: InjectionMap = new Map()) {}

  /**
   * Gets the value for the given context and asserts that its available
   */
  get<Value>(context: InjectionContext<Value>): Value {
    const result = this.access(context);
    if (result.isErr()) {
      throw new Error(result.error);
    }
    return result.value;
  }

  /**
   * Tries to access the value for the given context.
   */
  access<Value>(context: InjectionContext<Value>): Result<Value, string> {
    return context[readSymbol](this.map);
  }
}

export class MutableInjectionContainer extends InjectionContainer {
  register<Value>(context: InjectionContext<Value>, value: Value): () => void {
    if (this.map.has(context as InjectionContext<unknown>)) {
      throw new Error(`Context is already registered in the container`);
    }
    this.map.set(context as InjectionContext<unknown>, value);
    return () => this.map.delete(context as InjectionContext<unknown>);
  }
}

export class ImmutableInjectionContainer extends InjectionContainer {
  provide<Value>(
    context: InjectionContext<Value>,
    value: Value,
  ): ImmutableInjectionContainer {
    return new ImmutableInjectionContainer(
      new Map([
        ...this.map.entries(),
        [context as InjectionContext<unknown>, value],
      ]),
    );
  }
}

// Symbol not exported to make it impossible to access a context value without going through the ioc
const readSymbol = Symbol("read");

export class InjectionContext<Value> {
  private constructor(read: InjectionReaderFn<Value>) {
    this[readSymbol] = read;
  }

  readonly [readSymbol]: InjectionReaderFn<Value>;

  static withDefault<Value>(defaultValue: Value): InjectionContext<Value> {
    return new InjectionContext<Value>(function (map) {
      if (map.has(this as InjectionContext<unknown>)) {
        return ok(map.get(this as InjectionContext<unknown>) as Value);
      }
      return ok(defaultValue);
    });
  }

  static new<Value>(name: string): InjectionContext<Value> {
    return new InjectionContext<Value>(function (map) {
      if (map.has(this as InjectionContext<unknown>)) {
        return ok(map.get(this as InjectionContext<unknown>) as Value);
      }
      return err(`"${name}" context is missing in IOC container`);
    });
  }
}

type InjectionMap = Map<InjectionContext<unknown>, unknown>;

type InjectionReaderFn<Value> = (
  this: InjectionContext<Value>,
  map: InjectionMap,
) => Result<Value, string>;
