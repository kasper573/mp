export class Injector {
  private constructor(private map: InjectionMap) {}

  provide<Value>(context: InjectionContext<Value>, value: Value): Injector {
    return new Injector(
      new Map([
        ...this.map.entries(),
        [context as InjectionContext<unknown>, value],
      ]),
    );
  }

  get<Value>(context: InjectionContext<Value>): Value {
    return context[readSymbol](this.map);
  }

  static new(): Injector {
    return new Injector(new Map());
  }
}

// Symbol not exported to make it impossible to access a context value without going through the injector
const readSymbol = Symbol("read");

export class InjectionContext<Value> {
  private constructor(private read: InjectionReaderFn<Value>) {
    this[readSymbol] = read;
  }

  readonly [readSymbol]: InjectionReaderFn<Value>;

  derive<DerivedValue>(
    deriveFn: (value: Value) => DerivedValue,
  ): InjectionContext<DerivedValue> {
    return new InjectionContext((map) => deriveFn(this.read(map)));
  }

  static new<Value>(defaultValue?: Value): InjectionContext<Value> {
    if (arguments.length === 1) {
      return new InjectionContext<Value>(function (map) {
        if (map.has(this as InjectionContext<unknown>)) {
          return map.get(this as InjectionContext<unknown>) as Value;
        }
        return defaultValue as Value;
      });
    }

    return new InjectionContext<Value>(function (map) {
      if (map.has(this as InjectionContext<unknown>)) {
        return map.get(this as InjectionContext<unknown>) as Value;
      }
      throw new Error("Context not available in injector");
    });
  }
}

type InjectionMap = Map<InjectionContext<unknown>, unknown>;

type InjectionReaderFn<Value> = (
  this: InjectionContext<Value>,
  map: InjectionMap,
) => Value;
