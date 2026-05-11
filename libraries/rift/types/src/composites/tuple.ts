import { RiftTypeKind, type RiftType } from "../rift-type";

type TupleValues<T extends readonly RiftType[]> = {
  [K in keyof T]: T[K] extends RiftType<infer V> ? V : never;
};

export function tuple<const T extends readonly RiftType[]>(
  ...items: T
): RiftType<TupleValues<T>> {
  type Value = TupleValues<T>;
  return {
    kind: RiftTypeKind.Tuple,
    encode(w, v) {
      for (let i = 0; i < items.length; i++) {
        items[i].encode(w, v[i]);
      }
    },
    decode(r) {
      const out = new Array<unknown>(items.length);
      for (let i = 0; i < items.length; i++) {
        out[i] = items[i].decode(r);
      }
      return out as Value;
    },
    digest(w) {
      w.writeU8(RiftTypeKind.Tuple);
      w.writeU16(items.length);
      for (const it of items) {
        it.digest(w);
      }
    },
  };
}
