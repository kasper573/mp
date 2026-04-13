import type { RiftType } from "./types";
import type { ReadBuffer, WriteBuffer } from "./buffer";

export function transform<Inner, Outer>(
  innerType: RiftType<Inner>,
  fns: {
    encode: (value: Outer) => Inner;
    decode: (value: Inner) => Outer;
  },
): RiftType<Outer> {
  return {
    kind: `transform<${innerType.kind}>`,

    equals(a, b) {
      return innerType.equals(fns.encode(a), fns.encode(b));
    },

    write(w: WriteBuffer, value: Outer) {
      innerType.write(w, fns.encode(value));
    },

    read(r: ReadBuffer): Outer {
      return fns.decode(innerType.read(r));
    },

    encode(value: Outer): Uint8Array {
      return innerType.encode(fns.encode(value));
    },

    decode(buf: Uint8Array): Outer {
      return fns.decode(innerType.decode(buf));
    },

    encodeDelta(oldVal: Outer, newVal: Outer): Uint8Array | undefined {
      return innerType.encodeDelta(fns.encode(oldVal), fns.encode(newVal));
    },

    decodeDelta(buf: Uint8Array, existing: Outer): Outer {
      return fns.decode(innerType.decodeDelta(buf, fns.encode(existing)));
    },

    writeDelta(w: WriteBuffer, oldVal: Outer, newVal: Outer): boolean {
      return innerType.writeDelta(w, fns.encode(oldVal), fns.encode(newVal));
    },

    readDelta(r: ReadBuffer, existing: Outer): Outer {
      return fns.decode(innerType.readDelta(r, fns.encode(existing)));
    },
  };
}
