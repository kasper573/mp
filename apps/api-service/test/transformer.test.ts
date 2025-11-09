import { describe, expect, it } from "vitest";
import { transformer } from "../src/transformer";

describe("transformer", () => {
  describe("plain objects", () => {
    it("should serialize and deserialize plain objects without errors", () => {
      const data = { name: "test", value: 42, nested: { prop: "value" } };
      const serialized = transformer.serialize(data);
      const deserialized = transformer.deserialize(serialized);

      expect(deserialized).toEqual(data);
    });

    it("should handle arrays without errors", () => {
      const data = [1, 2, 3, { name: "test" }];
      const serialized = transformer.serialize(data);
      const deserialized = transformer.deserialize(serialized);

      expect(deserialized).toEqual(data);
    });

    it("should handle built-in types without errors", () => {
      const data = {
        date: new Date("2024-01-01"),
        regex: /test/g,
        map: new Map([["key", "value"]]),
        set: new Set([1, 2, 3]),
      };
      const serialized = transformer.serialize(data);
      const _deserialized = transformer.deserialize(serialized);

      // SuperJSON should handle these types without errors
    });
  });

  describe("class instances", () => {
    it("should throw error when serializing class instances", () => {
      class TestClass {
        constructor(
          public name: string,
          public value: number,
        ) {}
      }
      const instance = new TestClass("test", 42);

      expect(() => transformer.serialize(instance)).toThrow(
        /Detected class instance "TestClass" at path "root"/,
      );
    });

    it("should throw error for nested class instances with correct path", () => {
      class TestClass {
        constructor(
          public name: string,
          public value: number,
        ) {}
      }
      const data = {
        user: new TestClass("test", 42),
      };

      expect(() => transformer.serialize(data)).toThrow(
        /Detected class instance "TestClass" at path "root\.user"/,
      );
    });

    it("should throw error for class instances in arrays with correct path", () => {
      class TestClass {
        constructor(
          public name: string,
          public value: number,
        ) {}
      }
      const data = {
        items: [new TestClass("item1", 1)],
      };

      expect(() => transformer.serialize(data)).toThrow(
        /Detected class instance "TestClass" at path "root\.items\[0\]"/,
      );
    });

    it("should include helpful error message", () => {
      class MyCustomClass {
        constructor(public value: string) {}
      }
      const instance = new MyCustomClass("test");

      expect(() => transformer.serialize(instance)).toThrow(
        /Class instances cannot be reliably serialized through tRPC/,
      );
      expect(() => transformer.serialize(instance)).toThrow(
        /Consider using plain objects or registering the class with SuperJSON/,
      );
    });
  });

  describe("deserialization", () => {
    it("should not check deserialized data for class instances", () => {
      const data = { name: "test", value: 42 };
      const serialized = transformer.serialize(data);
      const deserialized = transformer.deserialize(serialized);

      // Deserialization should not throw even if we had a class instance before
      // (though SuperJSON converts it to plain object anyway)
      expect(deserialized).toEqual(data);
    });
  });
});
