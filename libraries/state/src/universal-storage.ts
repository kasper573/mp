import { MemoryStorage } from "./memory-storage";

/**
 * We prefer the use of enums so that we can lazy resolve the storage instance in a safe way in case
 * the storage is not available in the current environment (e.g. SSR).
 */
export type StorageType = "local" | "session";

export function getStorage(storageType: StorageType): Storage {
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

const fallbackStorage: Storage = new MemoryStorage();
