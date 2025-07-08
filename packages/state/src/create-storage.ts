import type { Observable } from "./observable";
import { observable } from "./observable";

export interface ReactiveStorage<T> {
  value: Observable<T>;
  effect: () => () => void;
}

export function createReactiveStorage<T>(
  storage: Storage,
  key: string,
  defaultValue: T,
): ReactiveStorage<T> {
  const value = observable(loadFromStorage<T>(storage, key, defaultValue));

  function createStorageEffect() {
    return value.subscribe((value) => {
      saveToStorage(storage, key, value);
    });
  }

  return { value, effect: createStorageEffect };
}

function loadFromStorage<T>(storage: Storage, key: string, defaultValue: T): T {
  const jsonString = storage.getItem(key);
  if (jsonString === null) {
    return defaultValue;
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return defaultValue;
  }
}

function saveToStorage<T>(storage: Storage, key: string, value: T) {
  storage.setItem(key, JSON.stringify(value));
}
