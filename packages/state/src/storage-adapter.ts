export class StorageAdapter<T> {
  private storage: Storage;

  constructor(
    storageType: StorageType,
    private key: string,
    private defaultValue: T,
  ) {
    this.storage = resolveStorageType(storageType);
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

/**
 * We prefer the use of enums so that we can lazy resolve the storage instance in a safe way in case
 * the storage is not available in the current environment (e.g. SSR).
 */
type StorageType = "local" | "session";

function resolveStorageType(storageType: StorageType): Storage {
  switch (storageType) {
    case "local":
      if (typeof localStorage === "undefined") {
        return fallbackStorage;
      }
      return localStorage;
    case "session":
      if (typeof sessionStorage === "undefined") {
        return fallbackStorage;
      }
      return sessionStorage;
  }
}

class MemoryStorage implements Storage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }

  get length(): number {
    return Object.keys(this.store).length;
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] ?? null;
  }
}

const fallbackStorage: Storage = new MemoryStorage();
