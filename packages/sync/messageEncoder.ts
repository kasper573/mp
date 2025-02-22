import { encode } from "cbor-x";
import type { Patch } from "./patch";

export function encodeServerToClientMessage(patch: Patch): Promise<Uint8Array> {
  return Promise.resolve(encode(patch));
}
