import { decode, encode, Tag } from "cbor2";
import { registerEncoder } from "cbor2/encoder";
import type { AbstractTransformer } from "./transformer";

export const cborTransformer: CBORTransformer = {
  parse: (buffer) => decode(new Uint8Array(buffer)),
  serialize: encode,
  registerDecoder: Tag.registerDecoder.bind(Tag),
  registerEncoder,
};

interface CBORTransformer extends AbstractTransformer<ArrayBuffer> {
  registerDecoder: typeof Tag.registerDecoder;
  registerEncoder: typeof registerEncoder;
}
