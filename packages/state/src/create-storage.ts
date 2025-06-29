import { atom, type Atom, effect } from "./atom";

export interface ReactiveStorage<T> {
  value: Atom<T>;
  effect: () => () => void;
}

export function createReactiveStorage<T>(
  storage: Storage,
  key: string,
  defaultValue: T,
): ReactiveStorage<T> {
  const value = atom(loadFromStorage<T>(storage, key, defaultValue));

  function createStorageEffect() {
    return effect(value, (value) => {
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
