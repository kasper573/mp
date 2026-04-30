import type { Reader } from "./reader";
import { RiftTypeKind, type RiftType } from "./rift-type";
import {
  ArraySignal,
  ObjectSignal,
  OptionalSignal,
  TransformSignal,
  TupleSignal,
  UnionSignal,
  type RiftSignal,
  type UnionVariant,
} from "./signals";
import { Writer } from "./writer";

export function object<F extends Record<string, RiftType>>(
  fields: F,
): RiftType<{ [K in keyof F]: F[K] extends RiftType<infer V> ? V : never }> {
  type Value = { [K in keyof F]: F[K] extends RiftType<infer V> ? V : never };
  const order = Object.keys(fields).sort() as (keyof F & string)[];
  function encode(w: Writer, v: Value): void {
    for (const k of order) {
      fields[k].encode(w, v[k]);
    }
  }
  function decode(r: Reader): Value {
    const out: Record<string, unknown> = {};
    for (const k of order) {
      out[k] = fields[k].decode(r);
    }
    return out as Value;
  }
  function defaultValue(): Value {
    const out: Record<string, unknown> = {};
    for (const k of order) {
      out[k] = fields[k].default();
    }
    return out as Value;
  }
  function inspect(): Uint8Array {
    const w = new Writer(32);
    w.writeU8(RiftTypeKind.Object);
    w.writeU16(order.length);
    for (const k of order) {
      w.writeString(k);
      w.writeBytes(fields[k].inspect());
    }
    return w.finish();
  }
  return {
    kind: RiftTypeKind.Object,
    inspect,
    default: defaultValue,
    encode,
    decode,
    signal: (v) => {
      const childSignals = {} as { [K in keyof Value]: RiftSignal<Value[K]> };
      for (const k of order) {
        (childSignals as Record<string, RiftSignal<unknown>>)[k] = fields[
          k
        ].signal(v[k]);
      }
      return new ObjectSignal<Value>(childSignals, order);
    },
  };
}

export function array<T>(item: RiftType<T>): RiftType<readonly T[]> {
  function encode(w: Writer, v: readonly T[]): void {
    w.writeU32(v.length);
    for (const x of v) {
      item.encode(w, x);
    }
  }
  function decode(r: Reader): readonly T[] {
    const n = r.readU32();
    const out = new Array<T>(n);
    for (let i = 0; i < n; i++) {
      out[i] = item.decode(r);
    }
    return out;
  }
  function inspect(): Uint8Array {
    const w = new Writer(32);
    w.writeU8(RiftTypeKind.Array);
    w.writeBytes(item.inspect());
    return w.finish();
  }
  return {
    kind: RiftTypeKind.Array,
    inspect,
    default: () => [],
    encode,
    decode,
    signal: (v) =>
      new ArraySignal<T>(
        v,
        (w, x) => item.encode(w, x),
        (r) => item.decode(r),
      ),
  };
}

type TupleValues<T extends readonly RiftType[]> = {
  [K in keyof T]: T[K] extends RiftType<infer V> ? V : never;
};

export function tuple<const T extends readonly RiftType[]>(
  ...items: T
): RiftType<TupleValues<T>> {
  type Value = TupleValues<T>;
  function encode(w: Writer, v: Value): void {
    for (let i = 0; i < items.length; i++) {
      items[i].encode(w, v[i]);
    }
  }
  function decode(r: Reader): Value {
    const out = new Array<unknown>(items.length);
    for (let i = 0; i < items.length; i++) {
      out[i] = items[i].decode(r);
    }
    return out as Value;
  }
  function defaultValue(): Value {
    const out = new Array<unknown>(items.length);
    for (let i = 0; i < items.length; i++) {
      out[i] = items[i].default();
    }
    return out as Value;
  }
  function inspect(): Uint8Array {
    const w = new Writer(32);
    w.writeU8(RiftTypeKind.Tuple);
    w.writeU16(items.length);
    for (const it of items) {
      w.writeBytes(it.inspect());
    }
    return w.finish();
  }
  return {
    kind: RiftTypeKind.Tuple,
    inspect,
    default: defaultValue,
    encode,
    decode,
    signal: (v) => {
      const children = items.map((it, i) => it.signal(v[i])) as {
        [K in keyof Value]: RiftSignal<Value[K]>;
      };
      return new TupleSignal<Value>(children);
    },
  };
}

export function optional<T>(inner: RiftType<T>): RiftType<T | undefined> {
  function encode(w: Writer, v: T | undefined): void {
    if (v === undefined) {
      w.writeBool(false);
      return;
    }
    w.writeBool(true);
    inner.encode(w, v);
  }
  function decode(r: Reader): T | undefined {
    if (!r.readBool()) {
      return undefined;
    }
    return inner.decode(r);
  }
  function inspect(): Uint8Array {
    const w = new Writer(16);
    w.writeU8(RiftTypeKind.Optional);
    w.writeBytes(inner.inspect());
    return w.finish();
  }
  return {
    kind: RiftTypeKind.Optional,
    inspect,
    default: () => undefined,
    encode,
    decode,
    signal: (v) => new OptionalSignal<T>(inner.signal(v ?? inner.default()), v),
  };
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
  function encode(w: Writer, v: Value): void {
    const idx = order.indexOf(v.tag);
    if (idx < 0) {
      throw new Error(`union tag not found: ${v.tag}`);
    }
    w.writeU16(idx);
    variants[v.tag as keyof V].encode(w, v.value as Inner[keyof V]);
  }
  function decode(r: Reader): Value {
    const idx = r.readU16();
    const tag = order[idx];
    if (tag === undefined) {
      throw new Error(`union index out of range: ${idx}`);
    }
    const value = variants[tag].decode(r);
    return { tag, value } as Value;
  }
  function defaultValue(): Value {
    const tag = order[0];
    return { tag, value: variants[tag].default() } as Value;
  }
  function inspect(): Uint8Array {
    const w = new Writer(32);
    w.writeU8(RiftTypeKind.Union);
    w.writeU16(order.length);
    for (const k of order) {
      w.writeString(k);
      w.writeBytes(variants[k].inspect());
    }
    return w.finish();
  }
  return {
    kind: RiftTypeKind.Union,
    inspect,
    default: defaultValue,
    encode,
    decode,
    signal: (v) => {
      const childSignals = {} as { [K in keyof V]: RiftSignal<Inner[K]> };
      for (const k of order) {
        const init =
          k === v.tag ? (v.value as Inner[typeof k]) : variants[k].default();
        (childSignals as Record<string, RiftSignal<unknown>>)[k] =
          variants[k].signal(init);
      }
      return new UnionSignal<Inner>(
        childSignals,
        order,
        v as {
          [K in keyof Inner]: UnionVariant<K & string, Inner[K]>;
        }[keyof Inner],
      );
    },
  };
}

export function transform<Inner, Outer>(
  inner: RiftType<Inner>,
  fromInner: (v: Inner) => Outer,
  toInner: (v: Outer) => Inner,
): RiftType<Outer> {
  function encode(w: Writer, v: Outer): void {
    inner.encode(w, toInner(v));
  }
  function decode(r: Reader): Outer {
    return fromInner(inner.decode(r));
  }
  function inspect(): Uint8Array {
    const w = new Writer(16);
    w.writeU8(RiftTypeKind.Transform);
    w.writeBytes(inner.inspect());
    return w.finish();
  }
  return {
    kind: RiftTypeKind.Transform,
    inspect,
    default: () => fromInner(inner.default()),
    encode,
    decode,
    signal: (v) =>
      new TransformSignal<Inner, Outer>(
        inner.signal(toInner(v)),
        fromInner,
        toInner,
      ),
  };
}
