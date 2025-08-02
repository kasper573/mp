// oxlint-disable no-unsafe-function-type
import { beforeEach, describe, expect, it } from "vitest";
import type { Patch } from "../src";
import { PatchOpCode, applyPatch } from "../src";

describe("applyPatch", () => {
  describe("Object operations", () => {
    let target: Record<string, unknown>;

    beforeEach(() => {
      target = { a: 1, b: { c: 2, d: 3 }, e: { f: 4 } };
    });

    it("should replace a top-level property", () => {
      const patch: Patch = [
        { op: PatchOpCode.Replace, path: "/a", value: "replaced" },
      ];
      applyPatch(target, patch);
      expect(target.a).toBe("replaced");
    });

    it("should delete a nested property", () => {
      const patch: Patch = [{ op: PatchOpCode.Delete, path: "/b/d" }];
      applyPatch(target, patch);
      expect((target.b as Record<string, unknown>).d).toBeUndefined();
      expect((target.b as Record<string, unknown>).c).toBe(2);
    });

    it("should assign partial to an object", () => {
      const patch: Patch = [
        { op: PatchOpCode.Assign, path: "/e", value: { g: 5 } },
      ];
      applyPatch(target, patch);
      expect(target.e as Record<string, unknown>).toMatchObject({ f: 4, g: 5 });
    });

    it("can target Proxy objects", () => {
      const proxy = new Proxy(target, {
        get: (obj, prop) => obj[prop as keyof typeof obj],
        set: (obj, prop, value) => {
          obj[prop as keyof typeof obj] = value;
          return true;
        },
      });
      const patch: Patch = [{ op: PatchOpCode.Replace, path: "/a", value: 42 }];
      applyPatch(proxy, patch);
      expect(proxy.a).toBe(42);
    });
  });

  describe("Array operations", () => {
    let target: unknown[];

    beforeEach(() => {
      target = [10, { x: 1, y: 2 }, 30];
    });

    it("should replace an element by index", () => {
      const patch: Patch = [
        { op: PatchOpCode.Replace, path: "/1", value: "elem" },
      ];
      applyPatch(target, patch);
      expect(target[1]).toBe("elem");
    });

    it("should delete an element by index", () => {
      const patch: Patch = [{ op: PatchOpCode.Delete, path: "/0" }];
      applyPatch(target, patch);
      expect(target).toEqual([{ x: 1, y: 2 }, 30]);
    });

    it("should assign partial to object within array", () => {
      const patch: Patch = [
        { op: PatchOpCode.Assign, path: "/1", value: { z: 3 } },
      ];
      applyPatch(target as unknown, patch);
      expect(target[1] as Record<string, unknown>).toMatchObject({
        x: 1,
        y: 2,
        z: 3,
      });
    });

    it("can target Proxy objects acting as arrays", () => {
      const proxy = new Proxy(target, Reflect);
      const patch: Patch = [{ op: PatchOpCode.Delete, path: "/2" }];
      applyPatch(proxy, patch);
      expect(proxy).toEqual([10, { x: 1, y: 2 }]);
    });
  });

  describe("Map operations", () => {
    let target: Map<string, unknown>;

    beforeEach(() => {
      target = new Map<string, unknown>([
        ["k1", 100],
        ["k2", { m: 1 }],
      ]);
    });

    it("should replace a map value", () => {
      const patch: Patch = [
        { op: PatchOpCode.Replace, path: "/k1", value: 200 },
      ];
      applyPatch(target, patch);
      expect(target.get("k1")).toBe(200);
    });

    it("should delete a map key", () => {
      const patch: Patch = [{ op: PatchOpCode.Delete, path: "/k2" }];
      applyPatch(target, patch);
      expect(target.has("k2")).toBe(false);
    });

    it("should assign partial to object in map", () => {
      const patch: Patch = [
        { op: PatchOpCode.Assign, path: "/k2", value: { n: 2 } },
      ];
      applyPatch(target, patch);
      expect(target.get("k2") as Record<string, unknown>).toMatchObject({
        m: 1,
        n: 2,
      });
    });

    it("can target Proxy objects acting as maps", () => {
      const proxy = new Proxy(target, {
        get: (obj, prop) => {
          const val = obj[prop as keyof typeof obj];
          return typeof val === "function" ? val.bind(obj) : val;
        },
      });
      const patch: Patch = [
        { op: PatchOpCode.Replace, path: "/k1", value: 300 },
      ];
      applyPatch(proxy, patch);
      expect(proxy.get("k1")).toBe(300);
    });
  });

  describe("Set operations", () => {
    let target: Set<unknown>;

    beforeEach(() => {
      target = new Set(["a", { o: 1 }, "c"]);
    });

    it("should replace a set element by index", () => {
      const patch: Patch = [
        { op: PatchOpCode.Replace, path: "/0", value: "z" },
      ];
      applyPatch(target, patch);
      expect(Array.from(target)[0]).toBe("z");
    });

    it("should delete a set element by index", () => {
      const before = Array.from(target);
      const patch: Patch = [{ op: PatchOpCode.Delete, path: "/2" }];
      applyPatch(target, patch);
      expect(Array.from(target)).toEqual(before.slice(0, 2));
    });

    it("should assign partial to object in set", () => {
      const patch: Patch = [
        { op: PatchOpCode.Assign, path: "/1", value: { p: 9 } },
      ];
      applyPatch(target, patch);
      const second = Array.from(target)[1] as Record<string, unknown>;
      expect(second).toMatchObject({ o: 1, p: 9 });
    });

    it("can target Proxy objects acting as sets", () => {
      const proxy = new Proxy(target, {
        get: (obj, prop) => {
          const val = obj[prop as keyof typeof obj];
          return typeof val === "function" ? val.bind(obj) : val;
        },
      });
      const patch: Patch = [{ op: PatchOpCode.Delete, path: "/1" }];
      applyPatch(proxy, patch);
      expect(Array.from(proxy.values())).toEqual(["a", "c"]);
    });
  });

  describe("General error handling", () => {
    it("should throw on invalid path syntax", () => {
      const target = { x: 1 };
      const patch: Patch = [
        { op: PatchOpCode.Replace, path: "invalid", value: 0 },
      ];
      expect(() => applyPatch(target, patch)).toThrow(/Invalid path/);
    });
  });
});
