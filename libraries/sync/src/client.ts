import { applyPatch } from "./patch";
import { decodeServerToClientMessage } from "./message-decoder";

export async function parsePatchMessage(event: MessageEvent) {
  const blob = await (event.data as Blob).arrayBuffer();
  const patch = decodeServerToClientMessage(blob);
  return function applyOnePatch(target: object) {
    applyPatch(target, patch);
  };
}
