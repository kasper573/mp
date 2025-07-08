export interface ReadonlyObservable<Value> {
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
  compose<OtherObservables extends ReadonlyObservable<unknown>[]>(
    ...other: OtherObservables
  ): ReadonlyObservable<[Value, ...ObservableValues<OtherObservables>]>;
  /**
   * Subscribe to changes in the observable.
   */
  subscribe(handler: SubscribeHandler<Value>): UnsubscribeFn;
  /**
   * Get the current value of the observable.
   * @internal
   */
  $getObservableValue(): Value;
}

export interface AbstractObservable<Value> extends ReadonlyObservable<Value> {
  /**
   * Notify subscribers that the value has changed.
   * @internal
   */
  $notifySubscribers: () => void;
}

type SubscribeHandler<Value> = (value: Value) => unknown;
type UnsubscribeFn = () => void;

export type ObservableValue<T extends ReadonlyObservable<unknown>> =
  T extends ReadonlyObservable<infer Value> ? Value : never;

type ObservableValues<ObservableArray extends ReadonlyObservable<unknown>[]> = {
  [Index in keyof ObservableArray]: ObservableValue<ObservableArray[Index]>;
};

export interface Observable<Value> extends AbstractObservable<Value> {
  set(value: Value): void;
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
): AbstractObservable<Value> {
  const subscribers = new Set<SubscribeHandler<Value>>();

  const self: AbstractObservable<Value> = {
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

    $getObservableValue() {
      return getValue();
    },

    $notifySubscribers() {
      const value = self.$getObservableValue();
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

function computed<
  Observables extends ReadonlyObservable<unknown>[],
  ComputedValue,
>(
  all: Observables,
  compute: (values: ObservableValues<Observables>) => ComputedValue,
): ReadonlyObservable<ComputedValue> {
  const subs = new Set<UnsubscribeFn>();
  const obs = abstractObservable<ComputedValue>(value, onMount, onCleanup);

  function value(): ComputedValue {
    return compute(
      all.map((o) => o.$getObservableValue()) as ObservableValues<Observables>,
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
