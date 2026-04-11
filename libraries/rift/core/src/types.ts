import { signal, type Signal } from "@preact/signals-core";
import { ReadBuffer, WriteBuffer } from "./buffer";
import type { EventBus } from "./event-bus";

interface RiftCodec<T> {
  write(w: WriteBuffer, v: T): void;
  read(r: ReadBuffer): T;
  equals(a: T, b: T): boolean;
}

export interface RiftType<T = unknown> extends RiftCodec<T> {
  readonly kind: string;
  encode(value: T): Uint8Array;
  decode(buf: Uint8Array): T;
  encodeDelta(oldVal: T, newVal: T): Uint8Array | undefined;
  decodeDelta(buf: Uint8Array, existing: T): T;
  writeDelta(w: WriteBuffer, oldVal: T, newVal: T): boolean;
  readDelta(r: ReadBuffer, existing: T): T;
}

export type Infer<T> = T extends RiftType<infer U> ? U : never;

function finishWrite(w: WriteBuffer): Uint8Array {
  return w.toUint8Array().slice();
}

function makeScalar<T>(kind: string, codec: RiftCodec<T>): () => RiftType<T> {
  return () => ({
    kind,
    ...codec,
    encode(value) {
      const w = new WriteBuffer();
      codec.write(w, value);
      return finishWrite(w);
    },
    decode(buf) {
      return codec.read(new ReadBuffer(buf));
    },
    encodeDelta(oldVal, newVal) {
      if (codec.equals(oldVal, newVal)) {
        return;
      }
      const w = new WriteBuffer();
      codec.write(w, newVal);
      return finishWrite(w);
    },
    decodeDelta(buf) {
      return codec.read(new ReadBuffer(buf));
    },

    writeDelta(w, oldVal, newVal) {
      if (codec.equals(oldVal, newVal)) {
        return false;
      }
      codec.write(w, newVal);
      return true;
    },
    readDelta(r) {
      return codec.read(r);
    },
  });
}

const numEq = (a: number, b: number) => a === b;

export function bool<V extends boolean = boolean>(): RiftType<V> {
  return makeScalar<V>("bool", {
    write: (w, v) => w.writeBool(v),
    read: (r) => r.readBool() as V,
    equals: (a, b) => a === b,
  })();
}

export function u8<V extends number = number>(): RiftType<V> {
  return makeScalar<V>("u8", {
    write: (w, v) => w.writeU8(v),
    read: (r) => r.readU8() as V,
    equals: numEq as RiftCodec<V>["equals"],
  })();
}

export function u16<V extends number = number>(): RiftType<V> {
  return makeScalar<V>("u16", {
    write: (w, v) => w.writeU16(v),
    read: (r) => r.readU16() as V,
    equals: numEq as RiftCodec<V>["equals"],
  })();
}

export function u32<V extends number = number>(): RiftType<V> {
  return makeScalar<V>("u32", {
    write: (w, v) => w.writeU32(v),
    read: (r) => r.readU32() as V,
    equals: numEq as RiftCodec<V>["equals"],
  })();
}

export function i8<V extends number = number>(): RiftType<V> {
  return makeScalar<V>("i8", {
    write: (w, v) => w.writeI8(v),
    read: (r) => r.readI8() as V,
    equals: numEq as RiftCodec<V>["equals"],
  })();
}

export function i16<V extends number = number>(): RiftType<V> {
  return makeScalar<V>("i16", {
    write: (w, v) => w.writeI16(v),
    read: (r) => r.readI16() as V,
    equals: numEq as RiftCodec<V>["equals"],
  })();
}

export function i32<V extends number = number>(): RiftType<V> {
  return makeScalar<V>("i32", {
    write: (w, v) => w.writeI32(v),
    read: (r) => r.readI32() as V,
    equals: numEq as RiftCodec<V>["equals"],
  })();
}

export function f32<V extends number = number>(): RiftType<V> {
  return makeScalar<V>("f32", {
    write: (w, v) => w.writeF32(v),
    read: (r) => r.readF32() as V,
    equals: numEq as RiftCodec<V>["equals"],
  })();
}

export function f64<V extends number = number>(): RiftType<V> {
  return makeScalar<V>("f64", {
    write: (w, v) => w.writeF64(v),
    read: (r) => r.readF64() as V,
    equals: numEq as RiftCodec<V>["equals"],
  })();
}

export function string<V extends string = string>(): RiftType<V> {
  return makeScalar<V>("string", {
    write: (w, v) => w.writeString(v),
    read: (r) => r.readString() as V,
    equals: (a, b) => a === b,
  })();
}

export type RiftSchema = Record<string, RiftType>;
export type InferStructValue<S extends RiftSchema> = {
  [K in keyof S]: Infer<S[K]>;
};

export interface RiftStruct<S extends RiftSchema = RiftSchema> extends RiftType<
  InferStructValue<S>
> {
  readonly kind: "struct";
  readonly fields: ReadonlyArray<{ name: string & keyof S; type: RiftType }>;
  createProxy(
    fieldSignals: Map<string, Signal>,
    onWrite: (fieldIndex: number) => void,
  ): InferStructValue<S>;
}

export function struct<S extends RiftSchema>(schema: S): RiftStruct<S> {
  type V = InferStructValue<S>;
  const fields = Object.entries(schema).map(([name, type], index) => ({
    name,
    type,
    index,
  }));
  const fieldIndexMap = new Map(fields.map((f) => [f.name, f.index]));

  function write(w: WriteBuffer, value: V): void {
    for (const f of fields) {
      f.type.write(w, value[f.name]);
    }
  }

  function read(r: ReadBuffer): V {
    const obj: Record<string, unknown> = {};
    for (const f of fields) {
      obj[f.name] = f.type.read(r);
    }
    return obj as V;
  }

  return {
    kind: "struct",
    fields: fields,
    equals(a, b) {
      for (const f of fields) {
        if (!f.type.equals(a[f.name], b[f.name])) {
          return false;
        }
      }
      return true;
    },
    encode(value) {
      const w = new WriteBuffer();
      write(w, value);
      return finishWrite(w);
    },
    decode(buf) {
      return read(new ReadBuffer(buf));
    },
    encodeDelta(oldVal, newVal) {
      const w = new WriteBuffer();
      if (this.writeDelta(w, oldVal, newVal)) {
        return finishWrite(w);
      }
      return;
    },
    decodeDelta(buf, existing) {
      return this.readDelta(new ReadBuffer(buf), existing);
    },
    write,
    read,
    writeDelta(w, oldVal, newVal) {
      let mask = 0;
      for (const f of fields) {
        if (
          !f.type.equals(
            (oldVal as Record<string, unknown>)[f.name],
            (newVal as Record<string, unknown>)[f.name],
          )
        ) {
          mask |= 1 << f.index;
        }
      }
      if (mask === 0) {
        return false;
      }
      w.writeU32(mask);
      for (const f of fields) {
        if (mask & (1 << f.index)) {
          f.type.write(w, (newVal as Record<string, unknown>)[f.name]);
        }
      }
      return true;
    },
    readDelta(r, existing) {
      const mask = r.readU32();
      const result = { ...existing } as Record<string, unknown>;
      for (const f of fields) {
        if (mask & (1 << f.index)) {
          result[f.name] = f.type.read(r);
        }
      }
      return result as V;
    },
    createProxy(fieldSignals, onWrite) {
      const fieldNames = fields.map((f) => f.name);
      return new Proxy({} as V, {
        get(_, prop) {
          if (typeof prop !== "string") {
            return;
          }
          const sig = fieldSignals.get(prop);
          return sig?.value;
        },
        set(_, prop, value) {
          if (typeof prop !== "string") {
            return false;
          }
          const sig = fieldSignals.get(prop);
          if (!sig) {
            return false;
          }
          sig.value = value;
          const idx = fieldIndexMap.get(prop);
          if (idx !== undefined) {
            onWrite(idx);
          }
          return true;
        },
        has(_, prop) {
          return typeof prop === "string" && fieldSignals.has(prop);
        },
        ownKeys() {
          return fieldNames;
        },
        getOwnPropertyDescriptor(_, prop) {
          if (typeof prop === "string" && fieldSignals.has(prop)) {
            return { configurable: true, enumerable: true, writable: true };
          }
          return;
        },
      });
    },
  };
}

export function array<T>(elementType: RiftType<T>): RiftType<T[]> {
  function write(w: WriteBuffer, value: T[]): void {
    w.writeU16(value.length);
    for (const item of value) {
      elementType.write(w, item);
    }
  }

  function read(r: ReadBuffer): T[] {
    const len = r.readU16();
    const result: T[] = [];
    for (let i = 0; i < len; i++) {
      result.push(elementType.read(r));
    }
    return result;
  }

  return {
    kind: "array",
    equals(a, b) {
      if (a.length !== b.length) {
        return false;
      }
      for (let i = 0; i < a.length; i++) {
        if (!elementType.equals(a[i], b[i])) {
          return false;
        }
      }
      return true;
    },
    encode(value) {
      const w = new WriteBuffer();
      write(w, value);
      return finishWrite(w);
    },
    decode(buf) {
      return read(new ReadBuffer(buf));
    },
    encodeDelta(oldVal, newVal) {
      const w = new WriteBuffer();
      if (this.writeDelta(w, oldVal, newVal)) {
        return finishWrite(w);
      }
      return;
    },
    decodeDelta(buf, existing) {
      return this.readDelta(new ReadBuffer(buf), existing);
    },
    write,
    read,
    writeDelta(w, oldVal, newVal) {
      const maxLen = Math.max(oldVal.length, newVal.length);
      const changed: number[] = [];
      for (let i = 0; i < maxLen; i++) {
        if (
          i >= oldVal.length ||
          i >= newVal.length ||
          !elementType.equals(oldVal[i], newVal[i])
        ) {
          changed.push(i);
        }
      }
      if (changed.length === 0) {
        return false;
      }

      w.writeU16(newVal.length);
      w.writeU16(changed.length);
      for (const idx of changed) {
        w.writeU16(idx);
        if (idx < newVal.length) {
          elementType.write(w, newVal[idx]);
        }
      }
      return true;
    },
    readDelta(r, existing) {
      const newLength = r.readU16();
      const numChanged = r.readU16();
      const result = existing.slice(0, newLength);
      while (result.length < newLength) {
        result.push(undefined as T);
      }
      for (let i = 0; i < numChanged; i++) {
        const idx = r.readU16();
        if (idx < newLength) {
          result[idx] = elementType.read(r);
        }
      }
      return result;
    },
  };
}

export function optional<T>(innerType: RiftType<T>): RiftType<T | undefined> {
  function write(w: WriteBuffer, value: T | undefined): void {
    if (value === undefined) {
      w.writeBool(false);
    } else {
      w.writeBool(true);
      innerType.write(w, value);
    }
  }

  function read(r: ReadBuffer): T | undefined {
    return r.readBool() ? innerType.read(r) : undefined;
  }

  return {
    kind: "optional",
    equals(a, b) {
      if (a === undefined && b === undefined) {
        return true;
      }
      if (a === undefined || b === undefined) {
        return false;
      }
      return innerType.equals(a, b);
    },
    encode(value) {
      const w = new WriteBuffer();
      write(w, value);
      return finishWrite(w);
    },
    decode(buf) {
      return read(new ReadBuffer(buf));
    },
    encodeDelta(oldVal, newVal) {
      if (this.equals(oldVal, newVal)) {
        return;
      }
      return this.encode(newVal);
    },
    decodeDelta(buf) {
      return this.decode(buf);
    },
    write,
    read,
    writeDelta(w, oldVal, newVal) {
      if (this.equals(oldVal, newVal)) {
        return false;
      }
      write(w, newVal);
      return true;
    },
    readDelta(r) {
      return read(r);
    },
  };
}

export interface RiftFlags<
  Names extends string = string,
> extends RiftType<number> {
  readonly flagNames: ReadonlyArray<Names>;
  set(mask: number, flag: Names): number;
  unset(mask: number, flag: Names): number;
  has(mask: number, flag: Names): boolean;
}

export type InferFlags<T extends RiftFlags> =
  T extends RiftFlags<infer N> ? N : never;

export function flags<const Names extends string>(
  ...names: Names[]
): RiftFlags<Names> {
  const indexMap = new Map(names.map((n, i) => [n, i]));
  const base = u32();

  return {
    ...base,
    kind: "flags",
    flagNames: names,
    set(mask, flag) {
      const idx = indexMap.get(flag);
      return idx === undefined ? mask : mask | (1 << idx);
    },
    unset(mask, flag) {
      const idx = indexMap.get(flag);
      return idx === undefined ? mask : mask & ~(1 << idx);
    },
    has(mask, flag) {
      const idx = indexMap.get(flag);
      return idx === undefined ? false : (mask & (1 << idx)) !== 0;
    },
  };
}

export interface TagType extends RiftType<void> {
  readonly kind: "tag";
}

export function tag(): TagType {
  return {
    kind: "tag",
    equals: () => true,
    encode: () => new Uint8Array(0),
    decode() {},
    encodeDelta: () => undefined,
    decodeDelta() {},
    write() {},
    read() {},
    writeDelta: () => false,
    readDelta() {},
  };
}

export interface TransformCodec<Inner, Outer> {
  encode(outer: Outer): Inner;
  decode(inner: Inner): Outer;
}

export function transform<Inner, Outer>(
  innerType: RiftType<Inner>,
  codec: TransformCodec<Inner, Outer>,
): RiftType<Outer> {
  return {
    kind: `transform(${innerType.kind})`,
    write(w, v) {
      innerType.write(w, codec.encode(v));
    },
    read(r) {
      return codec.decode(innerType.read(r));
    },
    equals(a, b) {
      return innerType.equals(codec.encode(a), codec.encode(b));
    },
    encode(v) {
      return innerType.encode(codec.encode(v));
    },
    decode(buf) {
      return codec.decode(innerType.decode(buf));
    },
    encodeDelta(oldVal, newVal) {
      return innerType.encodeDelta(codec.encode(oldVal), codec.encode(newVal));
    },
    decodeDelta(buf, existing) {
      return codec.decode(
        innerType.decodeDelta(buf, codec.encode(existing)),
      );
    },
    writeDelta(w, oldVal, newVal) {
      return innerType.writeDelta(
        w,
        codec.encode(oldVal),
        codec.encode(newVal),
      );
    },
    readDelta(r, existing) {
      return codec.decode(innerType.readDelta(r, codec.encode(existing)));
    },
  };
}

export function isStructType(type: RiftType): type is RiftStruct {
  return type.kind === "struct";
}

export function isTagType(type: RiftType): type is TagType {
  return type.kind === "tag";
}

export interface RiftStore {
  signal: Signal;
  fieldSignals?: Map<string, Signal>;
  dirty: boolean;
  dirtyFields: number;
}

export function createRiftStore(type: RiftType, value: unknown): RiftStore {
  if (isStructType(type)) {
    const fieldSignals = new Map<string, Signal>();
    const v = value as Record<string, unknown>;
    for (const f of type.fields) {
      fieldSignals.set(f.name, signal(v[f.name]));
    }
    return {
      signal: signal(value),
      fieldSignals,
      dirty: false,
      dirtyFields: 0,
    };
  }
  return {
    signal: signal(value),
    dirty: false,
    dirtyFields: 0,
  };
}

export interface RiftEventBusMap<ExtraArgs extends unknown[] = []> {
  get<T extends RiftType>(
    type: T,
  ): EventBus<(...args: [...ExtraArgs, data: Infer<T>]) => void> | undefined;
  set<T extends RiftType>(
    type: T,
    bus: EventBus<(...args: [...ExtraArgs, data: Infer<T>]) => void>,
  ): void;
  delete<T extends RiftType>(type: T): void;
}
