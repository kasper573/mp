import { decode } from "cbor-x";
import type { Patch } from "./patch";

export function decodeServerToClientMessage(buffer: ArrayBufferLike) {
  return decode(new Uint8Array(buffer)) as Patch;
}
