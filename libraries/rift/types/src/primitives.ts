import { RiftTypeKind, type RiftType } from "./rift-type";

export function u8<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.U8,
    digest: (w) => w.writeU8(RiftTypeKind.U8),
    encode: (w, v) => w.writeU8(v),
    decode: (r) => r.readU8() as T,
  };
}

export function u16<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.U16,
    digest: (w) => w.writeU8(RiftTypeKind.U16),
    encode: (w, v) => w.writeU16(v),
    decode: (r) => r.readU16() as T,
  };
}

export function u32<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.U32,
    digest: (w) => w.writeU8(RiftTypeKind.U32),
    encode: (w, v) => w.writeU32(v),
    decode: (r) => r.readU32() as T,
  };
}

export function u64<T extends bigint = bigint>(): RiftType<T> {
  return {
    kind: RiftTypeKind.U64,
    digest: (w) => w.writeU8(RiftTypeKind.U64),
    encode: (w, v) => w.writeU64(v),
    decode: (r) => r.readU64() as T,
  };
}

export function i8<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.I8,
    digest: (w) => w.writeU8(RiftTypeKind.I8),
    encode: (w, v) => w.writeI8(v),
    decode: (r) => r.readI8() as T,
  };
}

export function i16<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.I16,
    digest: (w) => w.writeU8(RiftTypeKind.I16),
    encode: (w, v) => w.writeI16(v),
    decode: (r) => r.readI16() as T,
  };
}

export function i32<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.I32,
    digest: (w) => w.writeU8(RiftTypeKind.I32),
    encode: (w, v) => w.writeI32(v),
    decode: (r) => r.readI32() as T,
  };
}

export function i64<T extends bigint = bigint>(): RiftType<T> {
  return {
    kind: RiftTypeKind.I64,
    digest: (w) => w.writeU8(RiftTypeKind.I64),
    encode: (w, v) => w.writeI64(v),
    decode: (r) => r.readI64() as T,
  };
}

export function f32<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.F32,
    digest: (w) => w.writeU8(RiftTypeKind.F32),
    encode: (w, v) => w.writeF32(v),
    decode: (r) => r.readF32() as T,
  };
}

export function f64<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.F64,
    digest: (w) => w.writeU8(RiftTypeKind.F64),
    encode: (w, v) => w.writeF64(v),
    decode: (r) => r.readF64() as T,
  };
}

export function bool<T extends boolean = boolean>(): RiftType<T> {
  return {
    kind: RiftTypeKind.Bool,
    digest: (w) => w.writeU8(RiftTypeKind.Bool),
    encode: (w, v) => w.writeBool(v),
    decode: (r) => r.readBool() as T,
  };
}

export function string<T extends string = string>(): RiftType<T> {
  return {
    kind: RiftTypeKind.String,
    digest: (w) => w.writeU8(RiftTypeKind.String),
    encode: (w, v) => w.writeString(v),
    decode: (r) => r.readString() as T,
  };
}

export function bytes(): RiftType<Uint8Array> {
  return {
    kind: RiftTypeKind.Bytes,
    digest: (w) => w.writeU8(RiftTypeKind.Bytes),
    encode: (w, v) => w.writeBytes(v),
    decode: (r) => r.readBytes(),
  };
}

export function enumOf<const Values extends readonly string[]>(
  ...values: Values
): RiftType<Values[number]> {
  if (values.length === 0) {
    throw new Error("enumOf requires at least one value");
  }
  const wide = values.length > 256;
  return {
    kind: RiftTypeKind.EnumOf,
    encode(w, v) {
      const idx = values.indexOf(v);
      if (idx < 0) {
        throw new Error(`enum value out of range: ${v}`);
      }
      if (wide) {
        w.writeU16(idx);
      } else {
        w.writeU8(idx);
      }
    },
    decode(r) {
      const idx = wide ? r.readU16() : r.readU8();
      const v = values[idx];
      if (v === undefined) {
        throw new Error(`enum index out of range: ${idx}`);
      }
      return v;
    },
    digest(w) {
      w.writeU8(RiftTypeKind.EnumOf);
      w.writeU16(values.length);
      for (const v of values) {
        w.writeString(v);
      }
    },
  };
}

export function bitflags<const Flags extends readonly string[]>(
  ...flags: Flags
): RiftType<{ [K in Flags[number]]: boolean }> {
  type Value = { [K in Flags[number]]: boolean };
  if (flags.length > 64) {
    throw new Error("bitflags supports up to 64 flags");
  }
  const width =
    flags.length <= 8 ? 1 : flags.length <= 16 ? 2 : flags.length <= 32 ? 4 : 8;
  return {
    kind: RiftTypeKind.Bitflags,
    encode(w, v) {
      if (width === 8) {
        let bits = 0n;
        for (let i = 0; i < flags.length; i++) {
          if ((v as Record<string, boolean>)[flags[i]]) {
            bits |= 1n << BigInt(i);
          }
        }
        w.writeU64(bits);
        return;
      }
      let bits = 0;
      for (let i = 0; i < flags.length; i++) {
        if ((v as Record<string, boolean>)[flags[i]]) {
          bits |= 1 << i;
        }
      }
      if (width === 1) {
        w.writeU8(bits);
      } else if (width === 2) {
        w.writeU16(bits);
      } else {
        w.writeU32(bits);
      }
    },
    decode(r) {
      const out: Record<string, boolean> = {};
      if (width === 8) {
        const bits = r.readU64();
        for (let i = 0; i < flags.length; i++) {
          out[flags[i]] = (bits & (1n << BigInt(i))) !== 0n;
        }
        return out as Value;
      }
      const bits =
        width === 1 ? r.readU8() : width === 2 ? r.readU16() : r.readU32();
      for (let i = 0; i < flags.length; i++) {
        out[flags[i]] = (bits & (1 << i)) !== 0;
      }
      return out as Value;
    },
    digest(w) {
      w.writeU8(RiftTypeKind.Bitflags);
      w.writeU16(flags.length);
      for (const f of flags) {
        w.writeString(f);
      }
    },
  };
}

export function copy<T>(ty: RiftType<T>): RiftType<T> {
  return { ...ty };
}
