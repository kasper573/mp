import { applyPatch } from "./patch";
import { decodeServerToClientMessage } from "./encoding";

export function parseSyncMessage(buffer: SyncMessage) {
  const patch = decodeServerToClientMessage(buffer);
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
