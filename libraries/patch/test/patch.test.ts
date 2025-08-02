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

    it("should throw on assign with non-object value", () => {
      const patch: Patch = [
        { op: PatchOpCode.Assign, path: "/a", value: 123 as never },
      ];
      expect(() => applyPatch(target, patch)).toThrow();
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

    it("should throw when deleting out-of-bounds index", () => {
      const patch: Patch = [{ op: PatchOpCode.Delete, path: "/5" }];
      expect(() => applyPatch(target, patch)).toThrow();
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

    it("should throw on replace with missing key", () => {
      const patch: Patch = [
        { op: PatchOpCode.Replace, path: "/missing", value: 1 },
      ];
      expect(() => applyPatch(target, patch)).toThrow();
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

    it("should throw on delete with invalid index", () => {
      const patch: Patch = [{ op: PatchOpCode.Delete, path: "/5" }];
      expect(() => applyPatch(target, patch)).toThrow();
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

    it("should throw when traversing non-container", () => {
      const target = { x: 1 };
      const patch: Patch = [
        { op: PatchOpCode.Replace, path: "/x/y", value: 5 },
      ];
      expect(() => applyPatch(target, patch)).toThrow(
        /Cannot traverse non-container/,
      );
    });
  });
});
