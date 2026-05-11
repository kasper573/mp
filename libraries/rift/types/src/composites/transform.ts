import { RiftTypeKind, type RiftType } from "../rift-type";

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
    digest(w) {
      w.writeU8(RiftTypeKind.Transform);
      inner.digest(w);
    },
  };
}
