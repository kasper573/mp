import { RiftTypeKind, type RiftType } from "../rift-type";
import { Writer } from "../writer";

export function transform<Inner, Outer>(
  inner: RiftType<Inner>,
  fromInner: (v: Inner) => Outer,
  toInner: (v: Outer) => Inner,
): RiftType<Outer> {
  return {
    kind: RiftTypeKind.Transform,
    encode(w, v) {
      inner.encode(w, toInner(v));
    },
    decode(r) {
      return fromInner(inner.decode(r));
    },
    inspect() {
      const w = new Writer(16);
      w.writeU8(RiftTypeKind.Transform);
      w.writeBytes(inner.inspect());
      return w.finish();
    },
  };
}
