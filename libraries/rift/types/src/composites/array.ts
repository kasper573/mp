import { RiftTypeKind, type RiftType } from "../rift-type";
import { Writer } from "../writer";

export function array<T>(item: RiftType<T>): RiftType<readonly T[]> {
  return {
    kind: RiftTypeKind.Array,
    encode(w, v): void {
      w.writeU32(v.length);
      for (const x of v) {
        item.encode(w, x);
      }
    },
    decode(r) {
      const n = r.readU32();
      const out = new Array<T>(n);
      for (let i = 0; i < n; i++) {
        out[i] = item.decode(r);
      }
      return out;
    },
    inspect() {
      const w = new Writer(32);
      w.writeU8(RiftTypeKind.Array);
      w.writeBytes(item.inspect());
      return w.finish();
    },
  };
}
