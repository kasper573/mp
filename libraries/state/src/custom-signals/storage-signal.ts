import { Signal } from "../signal";
import type { StorageType } from "../universal-storage";
import { getStorage } from "../universal-storage";

export class StorageSignal<T> extends Signal<T> {
  private storage: Storage;

  constructor(
    storageType: StorageType,
    private key: string,
    defaultValue: T,
  ) {
    const storage = getStorage(storageType);
    super(load(storage, key, defaultValue));
    this.storage = storage;
  }

  override set(newValue: T | ((prev: T) => T)): void {
    if (typeof newValue === "function") {
      const fn = newValue as (prev: T) => T;
      const resolved = fn(this.get());
      super.set(resolved);
      save(this.storage, this.key, resolved);
    } else {
      super.set(newValue);
      save(this.storage, this.key, newValue);
    }
  }
}

function load<T>(storage: Storage, key: string, defaultValue: T): T {
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

function save<T>(storage: Storage, key: string, value: T) {
  storage.setItem(key, JSON.stringify(value));
}
