import type { Result } from "@mp/std";
import { err, ok } from "@mp/std";
import type { Options } from "cbor-x";
import { Decoder, Encoder, FLOAT32_OPTIONS } from "cbor-x";

export * as s from "./schema";

export { addExtension as addEncoderExtension } from "cbor-x";

export interface Encoding<T> {
  decode(data: ArrayBufferLike): Result<T, Error | "skipped">;
  encode(value: T): ArrayBuffer;
  matches(data: ArrayBufferLike): boolean;
}

export function createEncoding<T>(header: number): Encoding<T> {
  if (header > encodingHeaderMaxLength) {
    throw new Error(`Header must be a 16-bit unsigned integer`);
  }

  const encoder = new Encoder(options);
  const decoder = new Decoder(options);

  return {
    matches(data: ArrayBufferLike) {
      const view = new DataView(data);
      return view.getUint16(0) === header;
    },
    decode(data) {
      try {
        const view = new DataView(data);
        if (view.getUint16(0) !== header) {
          return err("skipped");
        }

        const decoded = decoder.decode(new Uint8Array(data, 2)) as T;
        return ok(decoded);
      } catch (error) {
        return err(
          error instanceof Error
            ? error
            : new Error(`Failed to decode`, { cause: error }),
        );
      }
    },
    encode(value) {
      const encodedValue = encoder.encode(value) as Uint8Array;
      const buffer = new ArrayBuffer(encodedValue.byteLength + 2);

      new DataView(buffer).setUint16(0, header);
      new Uint8Array(buffer, 2).set(encodedValue);

      return buffer;
    },
  };
}

const options: Options = {
  useFloat32: FLOAT32_OPTIONS.ALWAYS,
};

const encodingHeaderMaxLength = 0xff_ff;
