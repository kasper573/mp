import { describe, it, expect } from "vitest";
import {
  bitflags,
  bool,
  bytes,
  enumOf,
  f32,
  f64,
  q16,
  i16,
  i32,
  i64,
  i8,
  Reader,
  string,
  u16,
  u32,
  u64,
  u8,
  Writer,
} from "../src/index";

function roundtrip<T>(
  ty: { encode: (w: Writer, v: T) => void; decode: (r: Reader) => T },
  v: T,
): T {
  const w = new Writer(64);
  ty.encode(w, v);
  const r = new Reader(w.finish());
  return ty.decode(r);
}

describe("primitives", () => {
  it("u8 roundtrips", () => {
    expect(roundtrip(u8(), 0)).toBe(0);
    expect(roundtrip(u8(), 255)).toBe(255);
  });
  it("u16 roundtrips", () => {
    expect(roundtrip(u16(), 65535)).toBe(65535);
  });
  it("u32 roundtrips", () => {
    expect(roundtrip(u32(), 0xdeadbeef)).toBe(0xdeadbeef);
  });
  it("u64 roundtrips", () => {
    expect(roundtrip(u64(), 0xffffffffffffffffn)).toBe(0xffffffffffffffffn);
  });
  it("signed roundtrip", () => {
    expect(roundtrip(i8(), -1)).toBe(-1);
    expect(roundtrip(i16(), -32768)).toBe(-32768);
    expect(roundtrip(i32(), -1)).toBe(-1);
    expect(roundtrip(i64(), -1n)).toBe(-1n);
  });
  it("floats roundtrip", () => {
    expect(roundtrip(f32(), 1.5)).toBeCloseTo(1.5);
    expect(roundtrip(f64(), Math.PI)).toBeCloseTo(Math.PI);
  });
  it("bool roundtrip", () => {
    expect(roundtrip(bool(), true)).toBe(true);
    expect(roundtrip(bool(), false)).toBe(false);
  });
  it("string roundtrip with unicode", () => {
    expect(roundtrip(string(), "hello 💥")).toBe("hello 💥");
  });
  it("bytes roundtrip", () => {
    const data = new Uint8Array([1, 2, 3, 255]);
    const out = roundtrip(bytes(), data);
    expect(Array.from(out)).toEqual([1, 2, 3, 255]);
  });
  it("enumOf roundtrip", () => {
    const ty = enumOf("red", "green", "blue");
    expect(roundtrip(ty, "green")).toBe("green");
  });
  it("enumOf throws on invalid value", () => {
    const ty = enumOf("a", "b");
    const w = new Writer(8);
    expect(() => ty.encode(w, "c" as "a")).toThrow();
  });
  it("bitflags up to 8 uses 1 byte", () => {
    const ty = bitflags("a", "b", "c");
    const v = { a: true, b: false, c: true };
    const w = new Writer(8);
    ty.encode(w, v);
    expect(w.offset).toBe(1);
    const r = new Reader(w.finish());
    expect(ty.decode(r)).toEqual(v);
  });
  it("bitflags up to 64", () => {
    const flags = Array.from(
      { length: 33 },
      (_, i) => `f${i}`,
    ) as readonly string[];
    const ty = bitflags(...(flags as [string, ...string[]]));
    const v: Record<string, boolean> = {};
    for (const f of flags) {
      v[f] = true;
    }
    const w = new Writer(16);
    ty.encode(w, v as never);
    expect(w.offset).toBe(8);
    const r = new Reader(w.finish());
    expect(ty.decode(r)).toEqual(v);
  });
  it("branded type params are structural numbers", () => {
    type UserId = number & { readonly __brand: "UserId" };
    const ty = u32<UserId>();
    const v = 42 as UserId;
    expect(roundtrip(ty, v)).toBe(42);
  });
  it("q16 roundtrips within 1/scale precision", () => {
    const ty = q16(256);
    const cases = [-127.5, -1.25, -1 / 256, 0, 1 / 256, 1.25, 127.5];
    for (const v of cases) {
      expect(Math.abs(roundtrip(ty, v) - v)).toBeLessThanOrEqual(1 / 256);
    }
  });
  it("q16 emits exactly 2 bytes", () => {
    const w = new Writer(4);
    q16(256).encode(w, 1);
    expect(w.offset).toBe(2);
  });
  it("q16 digest differs by scale", () => {
    const w1 = new Writer(8);
    q16(256).digest(w1);
    const w2 = new Writer(8);
    q16(128).digest(w2);
    expect(w1.finish()).not.toEqual(w2.finish());
  });
  it("q16 throws when value escapes encodable range", () => {
    const ty = q16(256);
    expect(() => roundtrip(ty, 200)).toThrow();
  });
});
