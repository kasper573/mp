import type { SyncEvent } from "./sync-event";
import type { AnyPatch } from "./types";

export type SyncMessage = [
  AnyPatch | undefined,
  serverTime: Date,
  events?: SyncEvent[],
];
