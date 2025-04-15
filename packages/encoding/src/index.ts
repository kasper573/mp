import * as cbor from "cbor-x";

export function decode<T>(buffer: ArrayBufferLike) {
  return cbor.decode(new Uint8Array(buffer)) as T;
}

export function encode<T>(patch: T): Uint8Array {
  return cbor.encode(patch) as Uint8Array;
}

export { addExtension as addEncoderExtension } from "cbor-x";
