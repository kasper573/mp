import type { TagNumber } from "cbor2";
import { decode, encode, Tag } from "cbor2";
import { registerEncoder } from "cbor2/encoder";
import type { AbstractTransformer } from "./transformer";

export const cborTransformer: CBORTransformer = {
  parse: (buffer) => decode(new Uint8Array(buffer)),
  serialize: encode,
  registerTag(tag, type, { encode, decode }) {
    // Unforunate assertions but it's not worth the hassle to fix
    registerEncoder(type as never, (map) => [tag, encode(map)]);
    Tag.registerDecoder(tag, (tag) => decode(tag.contents as never));
  },
};

interface CBORTransformer extends AbstractTransformer<ArrayBuffer> {
  registerTag<Type, Data>(
    tag: TagNumber,
    type: ClassOf<Type>,
    options: {
      encode: (data: Type) => Data;
      decode: (data: NoInfer<Data>) => NoInfer<Type>;
    },
  ): void;
}

type ClassOf<Type> = new (...args: never[]) => Type;
