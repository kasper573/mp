export class MutableInjectionContainer {
  constructor(private map: InjectionMap = new Map()) {}

  register<Value>(context: InjectionContext<Value>, value: Value): this {
    if (this.map.has(context as InjectionContext<unknown>)) {
      throw new Error(`Context is already registered in the container`);
    }
    this.map.set(context as InjectionContext<unknown>, value);
    return this;
  }

  get<Value>(context: InjectionContext<Value>): Value {
    return context[readSymbol](this.map);
  }
}

export class ImmutableInjectionContainer {
  constructor(private map: InjectionMap = new Map()) {}

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

  get<Value>(context: InjectionContext<Value>): Value {
    return context[readSymbol](this.map);
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
        return map.get(this as InjectionContext<unknown>) as Value;
      }
      return defaultValue;
    });
  }

  static new<Value>(name: string): InjectionContext<Value> {
    return new InjectionContext<Value>(function (map) {
      if (map.has(this as InjectionContext<unknown>)) {
        return map.get(this as InjectionContext<unknown>) as Value;
      }
      throw new Error(`"${name}" context is missing in IOC container`);
    });
  }
}

type InjectionMap = Map<InjectionContext<unknown>, unknown>;

type InjectionReaderFn<Value> = (
  this: InjectionContext<Value>,
  map: InjectionMap,
) => Value;
