export interface ObservableLike<Value> {
  /**
   * Create a new observable that derives its value from this observable.
   */
  derive<DerivedValue>(
    fn: (value: Value) => DerivedValue,
  ): ReadonlyObservable<DerivedValue>;
  /**
   * Create a new observable that combines this observable with others.
   * When any of the observables change, the new observable will notify its subscribers.
   */
  compose<OtherObservables extends ObservableLike<unknown>[]>(
    ...other: OtherObservables
  ): ReadonlyObservable<[Value, ...ObservableValues<OtherObservables>]>;
  /**
   * Subscribe to changes in the observable.
   */
  subscribe(handler: SubscribeHandler<Value>): UnsubscribeFn;

  /**
   * An observable may implement this symbol to provide a custom getter for its value.
   * This is useful for observables that already have a "get" member with a different signature,
   * and therefore unable to implement the `ReadonlyObservable` interface.
   * If you need to consistently access the value of ObservableLike instances, use the `getObservableValue` function.
   */
  [observableValueGetterSymbol]?: ValueGetter<Value>;
}

export interface ReadonlyObservable<Value> extends ObservableLike<Value> {
  /**
   * Get the current value of the observable.
   */
  get: ValueGetter<Value>;
}

export interface NotifyableObservable<Value> extends ReadonlyObservable<Value> {
  /**
   * Notify subscribers that the value has changed.
   * @internal
   */
  $notifySubscribers: () => void;
}

export interface Observable<Value> extends NotifyableObservable<Value> {
  set(value: Value): void;
}

type ValueGetter<Value> = () => Value;
type SubscribeHandler<Value> = (value: Value) => unknown;
type UnsubscribeFn = () => void;
type ObservableValue<T extends ObservableLike<unknown>> =
  T extends ObservableLike<infer Value> ? Value : never;
type ObservableValues<ObservableArray extends ObservableLike<unknown>[]> = {
  [Index in keyof ObservableArray]: ObservableValue<ObservableArray[Index]>;
};

export const observableValueGetterSymbol = Symbol("observableValueGetter");

export function getObservableValue<Value>(
  observable: ObservableLike<Value>,
): Value {
  if (Reflect.has(observable, observableValueGetterSymbol)) {
    const fn = Reflect.get(
      observable,
      observableValueGetterSymbol,
    ) as ValueGetter<Value>;
    return fn();
  }

  return (observable as ReadonlyObservable<Value>).get();
}

/**
 * A stateful mutable observable.
 */
export function observable<Value>(
  initialValue: Value,
  onMount?: () => unknown,
  onCleanup?: () => unknown,
): Observable<Value> {
  let value = initialValue;

  const self: Observable<Value> = {
    ...abstractObservable(() => value, onMount, onCleanup),
    set(newValue: Value) {
      value = newValue;
      self.$notifySubscribers();
    },
  };

  return self;
}

/**
 * A semi-mutable observable who can be told to notify its subscribers, but with abstract value storage.
 */
export function abstractObservable<Value>(
  getValue: () => Value,
  onMount?: () => unknown,
  onCleanup?: () => unknown,
): NotifyableObservable<Value> {
  const subscribers = new Set<SubscribeHandler<Value>>();

  const self: NotifyableObservable<Value> = {
    subscribe(handler) {
      if (subscribers.size === 0) {
        onMount?.();
      }
      subscribers.add(handler);
      return () => {
        const sizeBefore = subscribers.size;
        subscribers.delete(handler);
        if (subscribers.size === 0 && sizeBefore > 0) {
          onCleanup?.();
        }
      };
    },

    get() {
      return getValue();
    },

    $notifySubscribers() {
      const value = self.get();
      for (const handler of subscribers) {
        handler(value);
      }
    },

    derive(fn) {
      return computed([self], ([value]) => fn(value));
    },

    compose(...others) {
      return computed([self, ...others], (values) => values) as never;
    },
  };

  return self;
}

function computed<Observables extends ObservableLike<unknown>[], ComputedValue>(
  all: Observables,
  compute: (values: ObservableValues<Observables>) => ComputedValue,
): ReadonlyObservable<ComputedValue> {
  const subs = new Set<UnsubscribeFn>();
  const obs = abstractObservable<ComputedValue>(value, onMount, onCleanup);

  function value(): ComputedValue {
    return compute(
      all.map(getObservableValue) as ObservableValues<Observables>,
    );
  }

  function onMount() {
    for (const o of all) {
      subs.add(o.subscribe(obs.$notifySubscribers));
    }
  }

  function onCleanup() {
    for (const cleanup of subs) {
      cleanup();
    }
    subs.clear();
  }

  return obs;
}
