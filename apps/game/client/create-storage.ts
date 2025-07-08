import type { Accessor, Setter } from "solid-js";
import { createEffect, createSignal } from "solid-js";

export function createStorage<T>(
  storage: Storage,
  key: string,
  defaultValue: T,
): [Accessor<T>, Setter<T>] {
  const [value, setValue] = createSignal(
    loadFromStorage<T>(storage, key, defaultValue),
  );

  createEffect(() => {
    saveToStorage(storage, key, value());
  });

  return [value, setValue];
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
