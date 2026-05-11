import { RiftTypeKind, type RiftType } from "../rift-type";

export function array<T>(item: RiftType<T>): RiftType<readonly T[]> {
  return {
    kind: RiftTypeKind.Array,
    encode(w, v): void {
      w.writeVarU32(v.length);
      for (const x of v) {
        item.encode(w, x);
      }
    },
    decode(r) {
      const n = r.readVarU32();
      const out = new Array<T>(n);
      for (let i = 0; i < n; i++) {
        out[i] = item.decode(r);
      }
      return out;
    },
    digest(w) {
      w.writeU8(RiftTypeKind.Array);
      item.digest(w);
    },
  };
}
