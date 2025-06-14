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
