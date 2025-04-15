import { decode, encode } from "cbor-x";
import type { Patch } from "./patch";

export function decodeServerToClientMessage(buffer: ArrayBufferLike) {
  return decode(new Uint8Array(buffer)) as Patch;
}

export function encodeServerToClientMessage(patch: Patch): Uint8Array {
  return encode(patch);
}
