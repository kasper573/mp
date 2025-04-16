import * as cbor from "cbor-x";

export { addExtension as addEncoderExtension } from "cbor-x";

export function createEncoding<T>(header: number) {
  return {
    decode(data: ArrayBufferLike): T | undefined {
      const view = new DataView(data);
      if (view.getUint16(0) !== header) {
        return;
      }
      return cbor.decode(new Uint8Array(data, 2)) as T;
    },
    encode(value: T): ArrayBufferLike {
      const encodedValue = cbor.encode(value) as Uint8Array;
      const buffer = new ArrayBuffer(encodedValue.byteLength + 2);

      new DataView(buffer).setUint16(0, header);
      new Uint8Array(buffer, 2).set(encodedValue);

      return buffer;
    },
  };
}
