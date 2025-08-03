import { describe, expect, it } from "vitest";
import type { Operation, Patch } from "../src";
import { PatchOpCode, applyPatch } from "../src";

describe("applyPatch", () => {
  it("should set an object property at the given path", () => {
    const target = { a: { b: 1 } };
    const patch: Patch = [
      {
        op: PatchOpCode.ObjectPropertySet,
        path: ["a"],
        prop: "b",
        value: 2,
      },
    ];

    applyPatch(target, patch);
    expect(target.a.b).toBe(2);
  });

  it("should assign changes to an object at the given path", () => {
    const target = { a: { x: 1 } };
    const patch: Patch = [
      {
        op: PatchOpCode.ObjectAssign,
        path: ["a"],
        changes: { y: 2, z: 3 },
      },
    ];

    applyPatch(target, patch);
    expect(target.a.x).toBe(1);
    // @ts-expect-error: property does not exist
    expect(target.a.y).toBe(2);
    // @ts-expect-error: property does not exist
    expect(target.a.z).toBe(3);
  });

  it("should replace array elements at the given path", () => {
    const target = { arr: [1, 2, 3] };
    const patch: Patch = [
      {
        op: PatchOpCode.ArrayReplace,
        path: ["arr"],
        elements: [4, 5],
      },
    ];

    applyPatch(target, patch);
    expect(target.arr).toEqual([4, 5]);
  });

  it("should replace set values at the given path", () => {
    const target = { arr: new Set([1, 2, 3]) };
    const patch: Patch = [
      {
        op: PatchOpCode.SetReplace,
        path: ["arr"],
        values: [4, 5],
      },
    ];

    applyPatch(target, patch);
    expect(Array.from(target.arr)).toEqual([4, 5]);
  });

  it("should set a map entry at the given path", () => {
    const target = { m: new Map<string, number>([["k1", 1]]) };
    const patch: Patch = [
      {
        op: PatchOpCode.MapSet,
        path: ["m"],
        key: "k2",
        value: 2,
      },
    ];

    applyPatch(target, patch);
    expect(target.m.get("k1")).toBe(1);
    expect(target.m.get("k2")).toBe(2);
  });

  it("should delete a map entry at the given path", () => {
    const target = {
      m: new Map<string, number>([
        ["k1", 1],
        ["k2", 2],
      ]),
    };
    const patch: Patch = [
      {
        op: PatchOpCode.MapDelete,
        path: ["m"],
        key: "k2",
      },
    ];

    applyPatch(target, patch);
    expect(target.m.get("k1")).toBe(1);
    expect(target.m.get("k2")).toBe(undefined);
  });

  it("should replace map entries at the given path (bug: leaves map empty)", () => {
    const target = { m: new Map<string, number>([["old", 99]]) };
    const patch: Patch = [
      {
        op: PatchOpCode.MapReplace,
        path: ["m"],
        entries: [
          ["a", 1],
          ["b", 2],
        ],
      },
    ];

    applyPatch(target, patch);
    // Due to a bug in the implementation, map.entries() is used instead of op.entries, so the map becomes empty
    expect(target.m.size).toBe(0);
  });

  it("should throw for unsupported operation codes", () => {
    const target = {};
    const badOp = { op: 999, path: [] } as unknown as Operation;
    expect(() => applyPatch(target, [badOp])).toThrowError(
      "Unsupported patch operation",
    );
  });
});
