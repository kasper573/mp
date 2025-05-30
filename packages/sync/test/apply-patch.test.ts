import { it, expect, describe } from "vitest";
import type { Patch } from "../src/patch";
import { PatchType, applyPatch } from "../src/patch";

describe("objects", () => {
  it("should set a top-level property", () => {
    const target = {};
    const patch: Patch = [[PatchType.Set, ["foo"], 42]];
    applyPatch(target, patch);
    expect(target).toHaveProperty("foo", 42);
  });

  it("should set a nested property", () => {
    const target = { user: {} as Record<string, unknown> };
    const patch: Patch = [[PatchType.Set, ["user", "name"], "Alice"]];
    applyPatch(target, patch);
    expect(target.user.name).toBe("Alice");
  });

  it("should update an existing object at root", () => {
    const target = { user: { name: "Alice", age: 25 } };
    const patch: Patch = [[PatchType.Update, ["user"], { age: 26 }]];
    applyPatch(target, patch);
    expect(target.user).toEqual({ name: "Alice", age: 26 });
  });

  it("should update an existing nested object", () => {
    const target = {
      user: {
        profile: { bio: "", location: "X" },
      },
    };

    const patch: Patch = [
      [PatchType.Update, ["user", "profile"], { bio: "Hello" }],
    ];
    applyPatch(target, patch);
    expect(target.user.profile).toEqual({ bio: "Hello", location: "X" });
  });

  it("should throw when updating a non-existing value", () => {
    const target = {};
    const patch: Patch = [[PatchType.Update, ["user"], { age: 26 }]];
    expect(() => applyPatch(target, patch)).toThrowError(
      'Could not update value at path "user", no prexisting value found',
    );
  });

  it("should remove a top-level property", () => {
    const target = { foo: "bar", baz: "qux" };
    const patch: Patch = [[PatchType.Remove, ["foo"]]];
    applyPatch(target, patch);
    expect(target).not.toHaveProperty("foo");
    expect(target.baz).toBe("qux");
  });

  it("should remove a nested property", () => {
    const target = { user: { name: "Alice", age: 25 } };
    const patch: Patch = [[PatchType.Remove, ["user", "age"]]];
    applyPatch(target, patch);
    expect("age" in target.user).toBe(false);
    expect(target.user.name).toBe("Alice");
  });

  it("should apply multiple operations sequentially", () => {
    const target = { a: 1, b: { c: 2 } };
    const patch: Patch = [
      [PatchType.Set, ["d"], 4],
      [PatchType.Update, ["b"], { c: 3, d: 5 }],
      [PatchType.Remove, ["a"]],
    ];
    applyPatch(target, patch);
    expect(target).toEqual({ b: { c: 3, d: 5 }, d: 4 });
  });

  it("should handle numeric path steps on objects", () => {
    const target = { items: { 1: "one" } };
    const patch: Patch = [[PatchType.Set, ["items", 2], "two"]];
    applyPatch(target, patch);
    expect(target.items[2 as 1]).toBe("two");
  });
});

describe("maps", () => {
  it("should set an entry via map.set", () => {
    const map = new Map<string, unknown>();
    const patch: Patch = [[PatchType.Set, ["foo"], "bar"]];
    applyPatch(map, patch);
    expect(map.get("foo")).toBe("bar");
    expect(map.has("foo")).toBe(true);
  });

  it("should update an existing entry object by merging", () => {
    const map = new Map<string, unknown>();
    map.set("user", { name: "Alice", age: 25 });
    const patch: Patch = [
      [PatchType.Update, ["user"], { age: 26, active: true }],
    ];
    applyPatch(map, patch);
    const updated = map.get("user");
    expect(updated).toBeInstanceOf(Object);
    expect(updated as { name: string; age: number; active: boolean }).toEqual({
      name: "Alice",
      age: 26,
      active: true,
    });
  });

  it("should throw when updating a non-existent entry", () => {
    const map = new Map<string, unknown>();
    const patch: Patch = [[PatchType.Update, ["missing"], { foo: "bar" }]];
    expect(() => applyPatch(map, patch)).toThrowError(
      'Could not update value at path "missing", no prexisting value found',
    );
  });

  it("should remove an entry via map.delete", () => {
    const map = new Map<string, unknown>();
    map.set("baz", 123);
    const patch: Patch = [[PatchType.Remove, ["baz"]]];
    applyPatch(map, patch);
    expect(map.has("baz")).toBe(false);
    expect(map.get("baz")).toBeUndefined();
  });

  it("should handle numeric keys correctly", () => {
    const map = new Map<number, string>();
    const patch: Patch = [
      [PatchType.Set, [1], "one"],
      [PatchType.Set, [2], "two"],
    ];
    applyPatch(map, patch);
    expect(map.get(1)).toBe("one");
    expect(map.get(2)).toBe("two");
  });

  it("should apply multiple operations in sequence", () => {
    const map = new Map<string, unknown>();
    const patch: Patch = [
      [PatchType.Set, ["a"], 1],
      [PatchType.Set, ["b"], { x: 10 }],
      [PatchType.Update, ["b"], { y: 20 }],
      [PatchType.Remove, ["a"]],
    ];
    applyPatch(map, patch);
    expect(map.has("a")).toBe(false);
    expect(map.get("b")).toEqual({ x: 10, y: 20 });
  });
});
