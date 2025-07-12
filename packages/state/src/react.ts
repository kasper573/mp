import { useState, useEffect } from "preact/hooks";
import type { StorageAdapter } from "./storage/storage-adapter";

export function useStorage<T>(storage: StorageAdapter<T>) {
  const [value, setValue] = useState<T>(storage.load());
  useEffect(() => storage.save(value), [value, storage]);
  return [value, setValue] as const;
}

export { useSignalEffect, useSignal, useComputed } from "@preact/signals";
