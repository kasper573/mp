import { createEffect, createSignal } from "solid-js";
import type { StorageAdapter } from "./storage/storage-adapter";

export function useStorage<T>(storage: StorageAdapter<T>) {
  const [value, setValue] = createSignal<T>(storage.load());
  createEffect(() => storage.save(value()));
  return [value, setValue] as const;
}
