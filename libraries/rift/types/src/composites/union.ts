import { RiftTypeKind, type RiftType } from "../rift-type";
import { Writer } from "../writer";

export interface UnionVariant<Tag extends string, V> {
  readonly tag: Tag;
  readonly value: V;
}

type UnionValueShape<V extends Record<string, RiftType>> = {
  [K in keyof V]: UnionVariant<
    K & string,
    V[K] extends RiftType<infer U> ? U : never
  >;
}[keyof V];

export function union<V extends Record<string, RiftType>>(
  variants: V,
): RiftType<UnionValueShape<V>> {
  type Inner = { [K in keyof V]: V[K] extends RiftType<infer U> ? U : never };
  type Value = UnionValueShape<V>;
  const order = Object.keys(variants).sort() as (keyof V & string)[];
  return {
    kind: RiftTypeKind.Union,
    encode(w, v) {
      const idx = order.indexOf(v.tag);
      if (idx < 0) {
        throw new Error(`union tag not found: ${v.tag}`);
      }
      w.writeU16(idx);
      variants[v.tag as keyof V].encode(w, v.value as Inner[keyof V]);
    },
    decode(r) {
      const idx = r.readU16();
      const tag = order[idx];
      if (tag === undefined) {
        throw new Error(`union index out of range: ${idx}`);
      }
      const value = variants[tag].decode(r);
      return { tag, value } as Value;
    },
    inspect() {
      const w = new Writer(32);
      w.writeU8(RiftTypeKind.Union);
      w.writeU16(order.length);
      for (const k of order) {
        w.writeString(k);
        w.writeBytes(variants[k].inspect());
      }
      return w.finish();
    },
  };
}
