import { describe, expect, it } from "vitest";
import { array } from "../src/schemas/array";
import { boolean } from "../src/schemas/boolean";
import { discriminatedUnion } from "../src/schemas/discriminated-union";
import { float32 } from "../src/schemas/float32";
import { float64 } from "../src/schemas/float64";
import { int16 } from "../src/schemas/int16";
import { int32 } from "../src/schemas/int32";
import { map } from "../src/schemas/map";
import { object } from "../src/schemas/object";
import { optional } from "../src/schemas/optional";
import { partial } from "../src/schemas/partial";
import { set } from "../src/schemas/set";
import { string } from "../src/schemas/string";

describe("Primitive Schemas", () => {
  it("Boolean encode/decode", () => {
    const schema = boolean();
    expect(schema.decode(schema.encode(true))).toBe(true);
    expect(schema.decode(schema.encode(false))).toBe(false);
  });

  it("int16 encode/decode", () => {
    const schema = int16();
    expect(schema.decode(schema.encode(12345))).toBe(12345);
  });

  it("int32 encode/decode", () => {
    const schema = int32();
    expect(schema.decode(schema.encode(1234567890))).toBe(1234567890);
  });

  it("float32 encode/decode", () => {
    const schema = float32();
    expect(schema.decode(schema.encode(3.14))).toBeCloseTo(3.14);
  });

  it("float64 encode/decode", () => {
    const schema = float64();
    expect(schema.decode(schema.encode(Math.PI))).toBeCloseTo(Math.PI);
  });

  it("String encode/decode", () => {
    const schema = string();
    expect(schema.decode(schema.encode("Hello, 世界"))).toBe("Hello, 世界");
  });
});

describe("Composite Schemas", () => {
  it("Array encode/decode", () => {
    const schema = array(int16());
    const arr = [1, 2, 3, 32767];
    expect(schema.decode(schema.encode(arr))).toEqual(arr);
  });

  it("Set encode/decode", () => {
    const schema = set(string());
    const s = new Set(["a", "b", "c"]);
    expect(schema.decode(schema.encode(s))).toEqual(s);
  });

  it("Map encode/decode", () => {
    const schema = map(string(), int16());
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

  it("Optional stacked still behaves as if it's only one optional", () => {
    const schema = optional(optional(boolean()));
    expect(schema.decode(schema.encode(undefined))).toBeUndefined();
    expect(schema.decode(schema.encode(true))).toBe(true);
    expect(schema.decode(schema.encode(false))).toBe(false);
  });

  it("Optional stacked encodes to identical data as single optional", () => {
    const stackedSchema = optional(optional(boolean()));
    const singleSchema = optional(boolean());

    const data = true;
    const stackedEncoded = stackedSchema.encode(data);
    const singleEncoded = singleSchema.encode(data);

    expect(stackedEncoded).toEqual(singleEncoded);
  });
});

describe("Object Schemas", () => {
  enum TypeId {
    Primitives = 1,
    Entity = 3,
    Root = 4,
  }
  const primitiveShape = {
    str: string(),
    int16: int16(),
    int32: int32(),
    float32: float32(),
    float64: float64(),
    bool: boolean(),
    optionalBool: optional(boolean()),
    array: array(string()),
    set: set(string()),
    map: map(string(), string()),
  };

  const Primitives = object(TypeId.Primitives, primitiveShape);

  const Entity = object(TypeId.Entity, {
    ...primitiveShape,
    trait: Primitives,
    traitSet: set(Primitives),
    traitArray: array(Primitives),
    traitMap: map(string(), Primitives),
  });

  const Root = object(TypeId.Root, {
    ...primitiveShape,
    entitySet: set(Entity),
    entityArray: array(Entity),
    entityMap: map(string(), Entity),
  });
  type TRoot = typeof Root.$infer;

  it("Nested object encode/decode", () => {
    const sample: TRoot = {
      str: "root",
      int16: 42,
      int32: 1234567890,
      float32: 1.618,
      float64: Math.PI,
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

    expect(decoded.float32).toBeCloseTo(sample.float32);
    expect(decoded.float64).toBeCloseTo(sample.float64);

    // Since above expectations passed, we can assign exact values so that
    // the following toEqual doesn't fail due to floating point precision issues.
    decoded.float32 = sample.float32;
    decoded.float64 = sample.float64;

    expect(decoded).toEqual(sample);
  });

  it("Partial object encode/decode", () => {
    const schema = partial(
      object(1, {
        str: string(),
        int16: int16(),
      }),
    );

    const p = { str: "test" };
    const encoded = schema.encode(p);
    const decoded = schema.decode(encoded);

    expect(decoded).toEqual(p);
    expect(decoded.int16).toBeUndefined();
  });

  it("Partial object encoded size does change as schema gets more properties as long as input data remains the same", () => {
    const twoFieldSchema = partial(
      object(1, {
        str: string(),
        int16: int16(),
      }),
    );

    const threeFieldSchema = partial(
      object(1, {
        str: string(),
        int16: int16(),
        int32: int32(),
      }),
    );

    const input = { str: "test" };
    const twoSize = twoFieldSchema.encode(input).byteLength;
    const threeSize = threeFieldSchema.encode(input).byteLength;

    expect(twoSize).toEqual(threeSize);
  });
});

describe("ObjectUnionSchema", () => {
  // Define two variant schemas with a shared discriminator property 'kind'
  const A = object(1, { kind: int16(), name: string(), age: int16() });
  const B = object(2, { kind: int16(), title: string(), weight: int16() });
  const unionSchema = discriminatedUnion([A, B], "kind");

  it("encodes and decodes variant A correctly", () => {
    const valueA = { kind: 1, name: "Alice", age: 30 };
    const encoded = unionSchema.encode(valueA);
    const decoded = unionSchema.decode(encoded);
    expect(decoded).toEqual(valueA);
  });

  it("encodes and decodes variant B correctly", () => {
    const valueB = { kind: 2, title: "Engineer", weight: 70 };
    const encoded = unionSchema.encode(valueB);
    const decoded = unionSchema.decode(encoded);
    expect(decoded).toEqual(valueB);
  });

  it("sizeOf returns the same as underlying schema size", () => {
    const valueA = { kind: 1, name: "Bob", age: 25 };
    const sizeUnion = unionSchema.sizeOf(valueA);
    const sizeA = A.sizeOf(valueA);
    expect(sizeUnion).toEqual(sizeA);
  });

  it("throws on encoding unknown discriminator value", () => {
    const badValue = { kind: 3, unknown: "x" };
    // @ts-expect-error: Invalid discriminator
    expect(() => unionSchema.encode(badValue)).toThrow(
      /No matching variant for discriminator value: 3/,
    );
  });

  it("throws on decoding unknown typeId prefix", () => {
    // Create a buffer with an invalid typeId
    const invalidTypeId = 999;
    const buffer = new Uint8Array(2);
    const dv = new DataView(buffer.buffer);
    dv.setUint16(0, invalidTypeId, true);
    expect(() => unionSchema.decode(buffer)).toThrow(
      /Unknown variant with typeId: 999/,
    );
  });

  it("throws when duplicate typeIds are provided", () => {
    const C = object(1, { kind: int16(), extra: string() });
    expect(() => discriminatedUnion([A, C] as const, "kind")).toThrow(
      /Duplicate typeId 1 in union variants\./,
    );
  });
});
