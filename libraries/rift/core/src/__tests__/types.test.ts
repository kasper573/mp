import { describe, it, expect } from "vitest";
import {
  bool,
  u8,
  u16,
  u32,
  i8,
  i16,
  i32,
  f32,
  f64,
  string,
  struct,
  array,
  optional,
  flags,
  tag,
  type Infer,
  type InferFlags,
} from "../index";

describe("scalar types", () => {
  it("bool encodes and decodes", () => {
    const t = bool();

    const buf = t.encode(true);
    expect(t.decode(buf)).toBe(true);

    const buf2 = t.encode(false);
    expect(t.decode(buf2)).toBe(false);
  });

  it("u8 encodes and decodes", () => {
    const t = u8();
    expect(t.decode(t.encode(0))).toBe(0);
    expect(t.decode(t.encode(255))).toBe(255);
    expect(t.decode(t.encode(42))).toBe(42);
  });

  it("u16 encodes and decodes", () => {
    const t = u16();
    expect(t.decode(t.encode(0))).toBe(0);
    expect(t.decode(t.encode(65535))).toBe(65535);
  });

  it("u32 encodes and decodes", () => {
    const t = u32();
    expect(t.decode(t.encode(0))).toBe(0);
    expect(t.decode(t.encode(4294967295))).toBe(4294967295);
  });

  it("i8 encodes and decodes", () => {
    const t = i8();
    expect(t.decode(t.encode(-128))).toBe(-128);
    expect(t.decode(t.encode(127))).toBe(127);
  });

  it("i16 encodes and decodes", () => {
    const t = i16();
    expect(t.decode(t.encode(-32768))).toBe(-32768);
    expect(t.decode(t.encode(32767))).toBe(32767);
  });

  it("i32 encodes and decodes", () => {
    const t = i32();
    expect(t.decode(t.encode(-2147483648))).toBe(-2147483648);
    expect(t.decode(t.encode(2147483647))).toBe(2147483647);
  });

  it("f32 encodes and decodes", () => {
    const t = f32();
    const decoded = t.decode(t.encode(3.14));
    expect(decoded).toBeCloseTo(3.14, 5);
  });

  it("f64 encodes and decodes", () => {
    const t = f64();
    expect(t.decode(t.encode(Math.PI))).toBe(Math.PI);
  });

  it("string encodes and decodes", () => {
    const t = string();
    expect(t.decode(t.encode(""))).toBe("");
    expect(t.decode(t.encode("hello world"))).toBe("hello world");
    expect(t.decode(t.encode("emoji: 🎮"))).toBe("emoji: 🎮");
  });

  it("accepts branded types", () => {
    type PlayerId = number & { readonly __brand: "PlayerId" };
    const playerIdType = u32<PlayerId>();
    const encoded = playerIdType.encode(42 as PlayerId);
    const decoded: PlayerId = playerIdType.decode(encoded);
    expect(decoded).toBe(42);
  });
});

describe("struct type", () => {
  it("encodes and decodes a simple struct", () => {
    const Position = struct({ x: f32(), y: f32() });
    const value = { x: 10, y: 20 };
    const decoded = Position.decode(Position.encode(value));
    expect(decoded.x).toBeCloseTo(10);
    expect(decoded.y).toBeCloseTo(20);
  });

  it("encodes and decodes struct with strings", () => {
    const Player = struct({ name: string(), color: string() });
    const value = { name: "Alice", color: "#ff0000" };
    expect(Player.decode(Player.encode(value))).toEqual(value);
  });

  it("delta encodes only changed fields", () => {
    const Pos = struct({ x: f32(), y: f32() });
    const oldVal = { x: 0, y: 0 };
    const newVal = { x: 42, y: 0 };

    const delta = Pos.encodeDelta(oldVal, newVal);
    expect(delta).toBeDefined();

    // The delta should be smaller than or equal to a full encode
    // (for 2-field structs with bitmask overhead, it may be equal)
    const full = Pos.encode(newVal);
    expect(delta!.byteLength).toBeLessThanOrEqual(full.byteLength);

    // Decode delta and verify
    const result = Pos.decodeDelta(delta!, oldVal);
    expect(result.x).toBeCloseTo(42);
    expect(result.y).toBeCloseTo(0);
  });

  it("delta returns undefined when nothing changed", () => {
    const Pos = struct({ x: f32(), y: f32() });
    const val = { x: 1, y: 2 };
    expect(Pos.encodeDelta(val, { ...val })).toBeUndefined();
  });

  it("infers TypeScript types correctly", () => {
    const T = struct({ a: u32(), b: string() });
    type V = Infer<typeof T>;

    // This is a compile-time check — if types are wrong this won't compile
    const v: V = { a: 1, b: "hello" };
    expect(v.a).toBe(1);
    expect(v.b).toBe("hello");
  });
});

describe("array type", () => {
  it("encodes and decodes an empty array", () => {
    const Numbers = array(u32());
    expect(Numbers.decode(Numbers.encode([]))).toEqual([]);
  });

  it("encodes and decodes a populated array", () => {
    const Numbers = array(u32());
    const val = [1, 2, 3, 4, 5];
    expect(Numbers.decode(Numbers.encode(val))).toEqual(val);
  });

  it("encodes and decodes array of structs", () => {
    const Waypoints = array(struct({ x: f32(), y: f32() }));
    const val = [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
    ];
    const decoded = Waypoints.decode(Waypoints.encode(val));
    expect(decoded).toHaveLength(2);
    expect(decoded[0].x).toBeCloseTo(0);
    expect(decoded[1].x).toBeCloseTo(10);
  });

  it("delta encodes changes", () => {
    const T = array(u32());
    const oldVal = [1, 2, 3];
    const newVal = [1, 99, 3];
    const delta = T.encodeDelta(oldVal, newVal);
    expect(delta).toBeDefined();

    const result = T.decodeDelta(delta!, oldVal);
    expect(result).toEqual([1, 99, 3]);
  });

  it("delta handles length changes", () => {
    const T = array(u32());
    const oldVal = [1, 2, 3];
    const newVal = [1, 2, 3, 4, 5];
    const delta = T.encodeDelta(oldVal, newVal);
    expect(delta).toBeDefined();

    const result = T.decodeDelta(delta!, oldVal);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it("delta returns undefined when unchanged", () => {
    const T = array(u32());
    const val = [1, 2, 3];
    expect(T.encodeDelta(val, [1, 2, 3])).toBeUndefined();
  });
});

describe("optional type", () => {
  it("encodes and decodes present value", () => {
    const T = optional(string());
    expect(T.decode(T.encode("hello"))).toBe("hello");
  });

  it("encodes and decodes undefined", () => {
    const T = optional(string());
    expect(T.decode(T.encode(undefined))).toBeUndefined();
  });

  it("delta encodes change from undefined to value", () => {
    const T = optional(u32());
    const delta = T.encodeDelta(undefined, 42);
    expect(delta).toBeDefined();
    expect(T.decodeDelta(delta!, undefined)).toBe(42);
  });

  it("delta encodes change from value to undefined", () => {
    const T = optional(u32());
    const delta = T.encodeDelta(42, undefined);
    expect(delta).toBeDefined();
    expect(T.decodeDelta(delta!, 42)).toBeUndefined();
  });

  it("delta returns undefined when unchanged", () => {
    const T = optional(u32());
    expect(T.encodeDelta(undefined, undefined)).toBeUndefined();
    expect(T.encodeDelta(42, 42)).toBeUndefined();
  });
});

describe("flags type", () => {
  it("sets and checks flags", () => {
    const Status = flags("idle", "moving", "stunned", "dead");
    let s = 0;
    s = Status.set(s, "moving");
    expect(Status.has(s, "moving")).toBe(true);
    expect(Status.has(s, "idle")).toBe(false);
  });

  it("unsets flags", () => {
    const Status = flags("idle", "moving", "stunned", "dead");
    let s = Status.set(0, "moving");
    s = Status.set(s, "stunned");
    expect(Status.has(s, "moving")).toBe(true);
    expect(Status.has(s, "stunned")).toBe(true);

    s = Status.unset(s, "moving");
    expect(Status.has(s, "moving")).toBe(false);
    expect(Status.has(s, "stunned")).toBe(true);
  });

  it("encodes and decodes", () => {
    const Status = flags("idle", "moving", "stunned", "dead");
    let s = Status.set(0, "idle");
    s = Status.set(s, "dead");

    const decoded = Status.decode(Status.encode(s));
    expect(Status.has(decoded, "idle")).toBe(true);
    expect(Status.has(decoded, "dead")).toBe(true);
    expect(Status.has(decoded, "moving")).toBe(false);
  });

  it("InferFlags extracts flag names", () => {
    const Status = flags("idle", "moving", "stunned", "dead");
    type S = InferFlags<typeof Status>;
    // Compile-time check: this should be assignable
    const s: S = "idle";
    expect(s).toBe("idle");
  });
});

describe("tag type", () => {
  it("has no meaningful value — just presence", () => {
    const IsEnemy = tag();
    // Tag's value type is void — encode takes no args
    const buf = IsEnemy.encode();
    expect(buf.byteLength).toBe(0);
  });
});
