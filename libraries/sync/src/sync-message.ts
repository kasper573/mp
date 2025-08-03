import type { Patch } from "@mp/patch";
import type { SyncEvent } from "./sync-event";

export type SyncMessage = [
  Patch | undefined,
  serverTime: Date,
  events?: SyncEvent[],
];
