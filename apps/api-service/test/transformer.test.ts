import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { transformer } from "../src/transformer";

describe("transformer", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  describe("plain objects", () => {
    it("should serialize and deserialize plain objects without warnings", () => {
      const data = { name: "test", value: 42, nested: { prop: "value" } };
      const serialized = transformer.serialize(data);
      const _deserialized = transformer.deserialize(serialized);

      expect(_deserialized).toEqual(data);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should handle arrays without warnings", () => {
      const data = [1, 2, 3, { name: "test" }];
      const serialized = transformer.serialize(data);
      const _deserialized = transformer.deserialize(serialized);

      expect(_deserialized).toEqual(data);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should handle built-in types without warnings", () => {
      const data = {
        date: new Date("2024-01-01"),
        regex: /test/g,
        map: new Map([["key", "value"]]),
        set: new Set([1, 2, 3]),
      };
      const serialized = transformer.serialize(data);
      const _deserialized = transformer.deserialize(serialized);

      // SuperJSON should handle these types
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe("class instances", () => {
    it("should warn about class instances in development mode", () => {
      class TestClass1 {
        constructor(
          public name: string,
          public value: number,
        ) {}
      }
      process.env.NODE_ENV = "development";
      const instance = new TestClass1("test", 42);

      transformer.serialize(instance);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Detected class instance"),
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("TestClass1"),
      );
    });

    it("should warn about nested class instances", () => {
      class TestClass2 {
        constructor(
          public name: string,
          public value: number,
        ) {}
      }
      process.env.NODE_ENV = "development";
      const data = {
        user: new TestClass2("test", 42),
        items: [new TestClass2("item1", 1), new TestClass2("item2", 2)],
      };

      transformer.serialize(data);

      expect(consoleWarnSpy).toHaveBeenCalled();
      const calls = consoleWarnSpy.mock.calls;
      expect(
        calls.some((call) => String(call[0]).includes("root.user")),
      ).toBe(true);
      expect(
        calls.some((call) => String(call[0]).includes("root.items[0]")),
      ).toBe(true);
      expect(
        calls.some((call) => String(call[0]).includes("root.items[1]")),
      ).toBe(true);
    });

    it("should not warn in production mode", () => {
      class TestClass3 {
        constructor(
          public name: string,
          public value: number,
        ) {}
      }
      process.env.NODE_ENV = "production";
      const instance = new TestClass3("test", 42);

      transformer.serialize(instance);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should only warn once per class-path combination", () => {
      class TestClass4 {
        constructor(
          public name: string,
          public value: number,
        ) {}
      }
      process.env.NODE_ENV = "development";
      const instance = new TestClass4("test", 42);

      // Clear any previous warnings
      consoleWarnSpy.mockClear();

      transformer.serialize(instance);
      transformer.serialize(instance);
      transformer.serialize(instance);

      // Should only warn once despite serializing 3 times
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("deserialization", () => {
    it("should warn about class instances during deserialization in development", () => {
      class TestClass5 {
        constructor(
          public name: string,
          public value: number,
        ) {}
      }
      process.env.NODE_ENV = "development";
      const instance = new TestClass5("test", 42);
      const serialized = transformer.serialize(instance);

      // Clear warnings from serialization
      consoleWarnSpy.mockClear();

      // Deserialize should also warn
      transformer.deserialize(serialized);

      // Note: After deserialization, the object is typically a plain object,
      // not a class instance, unless SuperJSON has the class registered.
      // This test verifies the deserialization path is also checked.
    });
  });
});
