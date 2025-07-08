import type { StorageType } from "./universal-storage";
import { getStorage } from "./universal-storage";

export class StorageAdapter<T> {
  private storage: Storage;

  constructor(
    storageType: StorageType,
    private key: string,
    private defaultValue: T,
  ) {
    this.storage = getStorage(storageType);
  }

  load = (): T => {
    const jsonString = this.storage.getItem(this.key);
    if (jsonString === null) {
      return this.defaultValue;
    }

    try {
      return JSON.parse(jsonString) as T;
    } catch {
      return this.defaultValue;
    }
  };

  save = <T>(value: T) => {
    this.storage.setItem(this.key, JSON.stringify(value));
  };
}
