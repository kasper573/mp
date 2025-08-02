import { describe, expect, it } from "vitest";
import {
  array,
  boolean,
  float,
  long,
  map,
  object,
  optional,
  set,
  short,
  string,
} from "../src/schema";

describe("Primitive Schemas", () => {
  it("Boolean encode/decode", () => {
    const schema = boolean();
    expect(schema.decode(schema.encode(true))).toBe(true);
    expect(schema.decode(schema.encode(false))).toBe(false);
  });

  it("Short encode/decode", () => {
    const schema = short();
    expect(schema.decode(schema.encode(12345))).toBe(12345);
  });

  it("Long encode/decode", () => {
    const schema = long();
    expect(schema.decode(schema.encode(1234567890123456789n))).toBe(
      1234567890123456789n,
    );
  });

  it("Float encode/decode", () => {
    const schema = float();
    // oxlint-disable-next-line approx-constant
    expect(schema.decode(schema.encode(3.14159))).toBeCloseTo(3.14159);
  });

  it("String encode/decode", () => {
    const schema = string();
    expect(schema.decode(schema.encode("Hello, 世界"))).toBe("Hello, 世界");
  });
});

describe("Composite Schemas", () => {
  it("Array encode/decode", () => {
    const schema = array(short());
    const arr = [1, 2, 3, 65535];
    expect(schema.decode(schema.encode(arr))).toEqual(arr);
  });

  it("Set encode/decode", () => {
    const schema = set(string());
    const s = new Set(["a", "b", "c"]);
    expect(schema.decode(schema.encode(s))).toEqual(s);
  });

  it("Map encode/decode", () => {
    const schema = map(string(), short());
    const m = new Map<string, number>([
      ["x", 1],
      ["y", 2],
    ]);
    expect(schema.decode(schema.encode(m))).toEqual(m);
  });

  it("Optional encode/decode", () => {
    const schema = optional(boolean());
    expect(schema.decode(schema.encode(undefined))).toBeUndefined();
    expect(schema.decode(schema.encode(true))).toBe(true);
  });
});

describe("Object Schemas", () => {
  const primitiveShape = {
    str: string(),
    short: short(),
    long: long(),
    float: float(),
    bool: boolean(),
    optionalBool: optional(boolean()),
    array: array(string()),
    set: set(string()),
    map: map(string(), string()),
  };

  const Primitives = object(primitiveShape);
  type Primitives = typeof Primitives.infer;

  const Trait = Primitives;
  type Trait = Primitives;

  const Entity = object({
    ...primitiveShape,
    trait: Trait,
    traitSet: set(Trait),
    traitArray: array(Trait),
    traitMap: map(string(), Trait),
  });
  type Entity = typeof Entity.infer;

  const Root = object({
    ...primitiveShape,
    entitySet: set(Entity),
    entityArray: array(Entity),
    entityMap: map(string(), Entity),
  });
  type Root = typeof Root.infer;

  it("Nested object encode/decode", () => {
    const sample: Root = {
      str: "root",
      short: 42,
      long: 9007199254740991n,
      float: 1.618,
      bool: true,
      optionalBool: undefined,
      array: ["a", "b"],
      set: new Set(["x", "y"]),
      map: new Map([["k", "v"]]),
      entitySet: new Set(),
      entityArray: [],
      entityMap: new Map(),
    };
    const decoded = Root.decode(Root.encode(sample));
    expect(decoded).toEqual(sample);
  });
});
