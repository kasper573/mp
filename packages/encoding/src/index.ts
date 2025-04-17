import type { Result } from "@mp/std";
import { err, ok } from "@mp/std";
import * as cbor from "cbor-x";

export { addExtension as addEncoderExtension } from "cbor-x";

export function createEncoding<T>(header: number) {
  if (header > encodingHeaderMaxLength) {
    throw new Error(`Header must be a 16-bit unsigned integer`);
  }

  return {
    decode(data: ArrayBufferLike): Result<T, Error | "skipped"> {
      try {
        const view = new DataView(data);
        if (view.getUint16(0) !== header) {
          return err("skipped");
        }

        const decoded = cbor.decode(new Uint8Array(data, 2)) as T;
        return ok(decoded);
      } catch (error) {
        return err(
          error instanceof Error
            ? error
            : new Error(`Failed to decode`, { cause: error }),
        );
      }
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

const encodingHeaderMaxLength = 0xff_ff;
