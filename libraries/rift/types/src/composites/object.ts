import type { Reader } from "../reader";
import { RiftTypeKind, type RiftType } from "../rift-type";
import type { Writer } from "../writer";

export type FieldValues<F extends Record<string, RiftType>> = {
  [K in keyof F]: F[K] extends RiftType<infer V> ? V : never;
};

export interface ObjectType<
  F extends Record<string, RiftType>,
> extends RiftType<FieldValues<F>> {
  readonly kind: RiftTypeKind.Object;
  readonly fields: F;
  readonly fieldOrder: readonly (keyof F & string)[];
  readonly fieldBit: ReadonlyMap<string, number>;
  // Encode only the top-level fields whose bit is set in `mask`, prefixed
  // by the fieldmask itself. Used by the replication layer for delta
  // ComponentUpdated payloads.
  encodePartial(w: Writer, value: FieldValues<F>, mask: number): void;
  // Decode a fieldmask-encoded partial, merging into `current`. Returns a
  // fresh object so signal subscribers see a different reference.
  decodePartial(r: Reader, current: FieldValues<F>): FieldValues<F>;
}

export function object<F extends Record<string, RiftType>>(
  fields: F,
): ObjectType<F> {
  type Value = FieldValues<F>;
  const order = Object.keys(fields).sort() as (keyof F & string)[];
  const fieldBit = new Map<string, number>();
  for (let i = 0; i < order.length; i++) {
    fieldBit.set(order[i], i);
  }
  const maskWidth = fieldMaskWidth(order.length);

  return {
    kind: RiftTypeKind.Object,
    fields,
    fieldOrder: order,
    fieldBit,
    encode(w, v): void {
      for (const k of order) {
        fields[k].encode(w, v[k]);
      }
    },
    decode(r) {
      const out: Record<string, unknown> = {};
      for (const k of order) {
        out[k] = fields[k].decode(r);
      }
      return out as Value;
    },
    digest(w) {
      w.writeU8(RiftTypeKind.Object);
      w.writeU16(order.length);
      for (const k of order) {
        w.writeString(k);
        fields[k].digest(w);
      }
    },
    encodePartial(w, value, mask): void {
      writeMask(w, mask, maskWidth);
      for (let i = 0; i < order.length; i++) {
        if ((mask >>> i) & 1) {
          const k = order[i];
          fields[k].encode(w, value[k]);
        }
      }
    },
    decodePartial(r, current): Value {
      const mask = readMask(r, maskWidth);
      const out: Record<string, unknown> = { ...current };
      for (let i = 0; i < order.length; i++) {
        if ((mask >>> i) & 1) {
          const k = order[i];
          out[k] = fields[k].decode(r);
        }
      }
      return out as Value;
    },
  };
}

export function isObjectType(
  ty: RiftType,
): ty is ObjectType<Record<string, RiftType>> {
  return ty.kind === RiftTypeKind.Object;
}

type MaskWidth = 1 | 2 | 4;

// Components with up to 8 fields fit in 1 byte, up to 16 in 2, up to 32 in 4.
function fieldMaskWidth(fieldCount: number): MaskWidth {
  if (fieldCount <= 8) {
    return 1;
  }
  if (fieldCount <= 16) {
    return 2;
  }
  if (fieldCount <= 32) {
    return 4;
  }
  throw new Error(
    `Object types with more than 32 fields are not supported (got ${fieldCount})`,
  );
}

function writeMask(w: Writer, mask: number, width: MaskWidth): void {
  switch (width) {
    case 1:
      return w.writeU8(mask & 0xff);
    case 2:
      return w.writeU16(mask & 0xffff);
    case 4:
      return w.writeU32(mask >>> 0);
  }
}

function readMask(r: Reader, width: MaskWidth): number {
  switch (width) {
    case 1:
      return r.readU8();
    case 2:
      return r.readU16();
    case 4:
      return r.readU32();
  }
}
