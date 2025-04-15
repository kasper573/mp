import { decode } from "@mp/encoding";
import type { Patch } from "./patch";
import { applyPatch } from "./patch";

export function parseSyncMessage(buffer: SyncMessage) {
  const patch = decode<Patch>(buffer);
  return function applyOnePatch(target: object) {
    applyPatch(target, patch);
  };
}

export function isSyncMessage(buffer: ArrayBuffer): buffer is SyncMessage {
  return true;
}

export type SyncMessage = ArrayBuffer & {
  [syncMessageSymbol]: true;
};

const syncMessageSymbol = Symbol("syncMessage");
