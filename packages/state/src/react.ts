import { useEffect, useState } from "react";
import type { StorageAdapter } from "./storage/storage-adapter";
import { getObservableValue, type ObservableLike } from "./observable";

export function useObservable<Value>(observable: ObservableLike<Value>): Value {
  const [value, setValue] = useState(() => getObservableValue(observable));
  useEffect(() => observable.subscribe(setValue), [observable]);
  return value;
}

export function useStorage<T>(storage: StorageAdapter<T>) {
  const [value, setValue] = useState<T>(storage.load());
  useEffect(() => storage.save(value), [value, storage]);
  return [value, setValue] as const;
}
