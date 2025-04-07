import { applyPatch } from "./patch";
import { decodeServerToClientMessage } from "./message-decoder";

export async function parseSyncMessage(event: SyncMessage) {
  const blob = await event.data.arrayBuffer();
  const patch = decodeServerToClientMessage(blob);
  return function applyOnePatch(target: object) {
    applyPatch(target, patch);
  };
}

export function isSyncMessage(event: MessageEvent): event is SyncMessage {
  return true;
}

export type SyncMessage = Omit<MessageEvent, "data"> & {
  data: Blob;
  [syncMessageSymbol]: true;
};

const syncMessageSymbol = Symbol("syncMessage");
