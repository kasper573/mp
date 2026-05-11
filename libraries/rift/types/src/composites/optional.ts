import { RiftTypeKind, type RiftType } from "../rift-type";

export function optional<T>(inner: RiftType<T>): RiftType<T | undefined> {
  return {
    kind: RiftTypeKind.Optional,
    encode(w, v) {
      if (v === undefined) {
        w.writeBool(false);
        return;
      }
      w.writeBool(true);
      inner.encode(w, v);
    },
    decode(r) {
      if (!r.readBool()) {
        return undefined;
      }
      return inner.decode(r);
    },
    digest(w) {
      w.writeU8(RiftTypeKind.Optional);
      inner.digest(w);
    },
  };
}
