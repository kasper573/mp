import type { AnyPatch } from "./patch";
import type { SyncEvent } from "./sync-event";

export type SyncMessage = [
  AnyPatch | undefined,
  serverTime: Date,
  events?: SyncEvent[],
];
