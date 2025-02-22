import { encode } from "npm:cbor-x";
import type { Patch } from "../patch.ts";

export function encodeServerToClientMessage(patch: Patch): Promise<Uint8Array> {
  return Promise.resolve(encode(patch));
}
