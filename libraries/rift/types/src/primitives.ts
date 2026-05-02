import { LeafSignal } from "./signals";
import { RiftTypeKind, type RiftType } from "./rift-type";
import { Writer } from "./writer";

function primitiveInspect(kind: RiftTypeKind): Uint8Array {
  const w = new Writer(1);
  w.writeU8(kind);
  return w.finish();
}

export function u8<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.U8,
    inspect: () => primitiveInspect(RiftTypeKind.U8),
    default: () => 0 as T,
    encode: (w, v) => w.writeU8(v),
    decode: (r) => r.readU8() as T,
    signal: (v) =>
      new LeafSignal<T>(
        v,
        (w, x) => w.writeU8(x),
        (r) => r.readU8() as T,
      ),
  };
}

export function u16<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.U16,
    inspect: () => primitiveInspect(RiftTypeKind.U16),
    default: () => 0 as T,
    encode: (w, v) => w.writeU16(v),
    decode: (r) => r.readU16() as T,
    signal: (v) =>
      new LeafSignal<T>(
        v,
        (w, x) => w.writeU16(x),
        (r) => r.readU16() as T,
      ),
  };
}

export function u32<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.U32,
    inspect: () => primitiveInspect(RiftTypeKind.U32),
    default: () => 0 as T,
    encode: (w, v) => w.writeU32(v),
    decode: (r) => r.readU32() as T,
    signal: (v) =>
      new LeafSignal<T>(
        v,
        (w, x) => w.writeU32(x),
        (r) => r.readU32() as T,
      ),
  };
}

export function u64<T extends bigint = bigint>(): RiftType<T> {
  return {
    kind: RiftTypeKind.U64,
    inspect: () => primitiveInspect(RiftTypeKind.U64),
    default: () => 0n as T,
    encode: (w, v) => w.writeU64(v),
    decode: (r) => r.readU64() as T,
    signal: (v) =>
      new LeafSignal<T>(
        v,
        (w, x) => w.writeU64(x),
        (r) => r.readU64() as T,
      ),
  };
}

export function i8<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.I8,
    inspect: () => primitiveInspect(RiftTypeKind.I8),
    default: () => 0 as T,
    encode: (w, v) => w.writeI8(v),
    decode: (r) => r.readI8() as T,
    signal: (v) =>
      new LeafSignal<T>(
        v,
        (w, x) => w.writeI8(x),
        (r) => r.readI8() as T,
      ),
  };
}

export function i16<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.I16,
    inspect: () => primitiveInspect(RiftTypeKind.I16),
    default: () => 0 as T,
    encode: (w, v) => w.writeI16(v),
    decode: (r) => r.readI16() as T,
    signal: (v) =>
      new LeafSignal<T>(
        v,
        (w, x) => w.writeI16(x),
        (r) => r.readI16() as T,
      ),
  };
}

export function i32<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.I32,
    inspect: () => primitiveInspect(RiftTypeKind.I32),
    default: () => 0 as T,
    encode: (w, v) => w.writeI32(v),
    decode: (r) => r.readI32() as T,
    signal: (v) =>
      new LeafSignal<T>(
        v,
        (w, x) => w.writeI32(x),
        (r) => r.readI32() as T,
      ),
  };
}

export function i64<T extends bigint = bigint>(): RiftType<T> {
  return {
    kind: RiftTypeKind.I64,
    inspect: () => primitiveInspect(RiftTypeKind.I64),
    default: () => 0n as T,
    encode: (w, v) => w.writeI64(v),
    decode: (r) => r.readI64() as T,
    signal: (v) =>
      new LeafSignal<T>(
        v,
        (w, x) => w.writeI64(x),
        (r) => r.readI64() as T,
      ),
  };
}

export function f32<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.F32,
    inspect: () => primitiveInspect(RiftTypeKind.F32),
    default: () => 0 as T,
    encode: (w, v) => w.writeF32(v),
    decode: (r) => r.readF32() as T,
    signal: (v) =>
      new LeafSignal<T>(
        v,
        (w, x) => w.writeF32(x),
        (r) => r.readF32() as T,
      ),
  };
}

export function f64<T extends number = number>(): RiftType<T> {
  return {
    kind: RiftTypeKind.F64,
    inspect: () => primitiveInspect(RiftTypeKind.F64),
    default: () => 0 as T,
    encode: (w, v) => w.writeF64(v),
    decode: (r) => r.readF64() as T,
    signal: (v) =>
      new LeafSignal<T>(
        v,
        (w, x) => w.writeF64(x),
        (r) => r.readF64() as T,
      ),
  };
}

export function bool<T extends boolean = boolean>(): RiftType<T> {
  return {
    kind: RiftTypeKind.Bool,
    inspect: () => primitiveInspect(RiftTypeKind.Bool),
    default: () => false as T,
    encode: (w, v) => w.writeBool(v),
    decode: (r) => r.readBool() as T,
    signal: (v) =>
      new LeafSignal<T>(
        v,
        (w, x) => w.writeBool(x),
        (r) => r.readBool() as T,
      ),
  };
}

export function string<T extends string = string>(): RiftType<T> {
  return {
    kind: RiftTypeKind.String,
    inspect: () => primitiveInspect(RiftTypeKind.String),
    default: () => "" as T,
    encode: (w, v) => w.writeString(v),
    decode: (r) => r.readString() as T,
    signal: (v) =>
      new LeafSignal<T>(
        v,
        (w, x) => w.writeString(x),
        (r) => r.readString() as T,
      ),
  };
}

export function bytes(): RiftType<Uint8Array> {
  return {
    kind: RiftTypeKind.Bytes,
    inspect: () => primitiveInspect(RiftTypeKind.Bytes),
    default: () => new Uint8Array(0),
    encode: (w, v) => w.writeBytes(v),
    decode: (r) => r.readBytes(),
    signal: (v) =>
      new LeafSignal<Uint8Array>(
        v,
        (w, x) => w.writeBytes(x),
        (r) => r.readBytes(),
      ),
  };
}

export function enumOf<const Values extends readonly string[]>(
  ...values: Values
): RiftType<Values[number]> {
  if (values.length === 0) {
    throw new Error("enumOf requires at least one value");
  }
  const wide = values.length > 256;
  function encode(w: Writer, v: Values[number]): void {
    const idx = values.indexOf(v);
    if (idx < 0) {
      throw new Error(`enum value out of range: ${v}`);
    }
    if (wide) w.writeU16(idx);
    else w.writeU8(idx);
  }
  function decode(r: { readU16(): number; readU8(): number }): Values[number] {
    const idx = wide ? r.readU16() : r.readU8();
    const v = values[idx];
    if (v === undefined) {
      throw new Error(`enum index out of range: ${idx}`);
    }
    return v;
  }
  function inspect(): Uint8Array {
    const w = new Writer(16);
    w.writeU8(RiftTypeKind.EnumOf);
    w.writeU16(values.length);
    for (const v of values) {
      w.writeString(v);
    }
    return w.finish();
  }
  const defaultValue = values[0];
  return {
    kind: RiftTypeKind.EnumOf,
    inspect,
    default: () => defaultValue,
    encode,
    decode,
    signal: (v) => new LeafSignal<Values[number]>(v, encode, decode),
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
  function defaultValue(): Value {
    const v: Record<string, boolean> = {};
    for (const f of flags) {
      v[f] = false;
    }
    return v as Value;
  }
  function encode(w: Writer, v: Value): void {
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
  }
  function decode(r: {
    readU8(): number;
    readU16(): number;
    readU32(): number;
    readU64(): bigint;
  }): Value {
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
  }
  function inspect(): Uint8Array {
    const w = new Writer(16);
    w.writeU8(RiftTypeKind.Bitflags);
    w.writeU16(flags.length);
    for (const f of flags) {
      w.writeString(f);
    }
    return w.finish();
  }
  return {
    kind: RiftTypeKind.Bitflags,
    inspect,
    default: defaultValue,
    encode,
    decode,
    signal: (v) => new LeafSignal<Value>(v, encode, decode),
  };
}
