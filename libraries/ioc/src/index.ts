import type { Result } from "@mp/std";
import { err, ok } from "@mp/std";

export class InjectionContainer {
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

  provide<Value>(
    context: InjectionContext<Value>,
    value: Value,
  ): InjectionContainer {
    return new InjectionContainer(
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

  static record<Values>(): ContextRecordFor<Values> {
    return new Proxy({} as ContextRecordFor<Values>, {
      get: <K extends keyof Values>(
        target: ContextRecordFor<Values>,
        prop: PropertyKey,
      ) => {
        const key = prop as K;
        if (key in target) {
          return target[key];
        }
        const context = InjectionContext.new<Values[K]>(prop as string);
        target[key] = context;
        return context;
      },
    });
  }
}

type ContextRecordFor<T> = {
  [K in keyof T]: InjectionContext<T[K]>;
};

type InjectionMap = Map<InjectionContext<unknown>, unknown>;

type InjectionReaderFn<Value> = (
  this: InjectionContext<Value>,
  map: InjectionMap,
) => Result<Value, string>;
