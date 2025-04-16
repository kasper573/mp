import * as cbor from "cbor-x";

export { addExtension as addEncoderExtension } from "cbor-x";

export function createEncoding<T>(header: number) {
  return {
    decode(data: ArrayBufferLike): T | undefined {
      const view = new Uint8Array(data);
      if (view.at(0) !== header) {
        return;
      }
      return cbor.decode(view.slice(1)) as T;
    },
    encode(value: T): ArrayBufferLike {
      const encodedValue = cbor.encode(value) as Uint8Array;
      const result = new Uint8Array(encodedValue.byteLength + 1);
      result[0] = header;
      result.set(new Uint8Array(encodedValue), 1);
      return result.buffer;
    },
  };
}
