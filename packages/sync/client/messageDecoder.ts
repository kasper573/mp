import { decode } from "npm:cbor-x";
import type { Patch } from "../patch.ts";

export function decodeServerToClientMessage(buffer: ArrayBufferLike) {
  return decode(new Uint8Array(buffer)) as Patch;
}
