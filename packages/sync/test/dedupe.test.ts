import { describe, it, expect } from "vitest";
import { PatchType, type Patch } from "../src/patch";
import { dedupePatch } from "../src/patch-deduper";

describe("dedupePatch", () => {
  it("should return an empty patch when given []", () => {
    const original: Patch = [];
    const result = dedupePatch(original);
    expect(result).toEqual([]);
  });

  it("should preserve a patch with no duplicate paths", () => {
    const original: Patch = [
      [PatchType.Set, ["a"], 1],
      [PatchType.Set, ["b"], 2],
      [PatchType.Set, ["c", "d"], 3],
    ];
    const deduped = dedupePatch(original);
    expect(deduped).toEqual(original);
  });

  it("should only keep last operations on the same path when only using set operations", () => {
    const patch: Patch = [
      [PatchType.Set, ["foo"], "first"],
      [PatchType.Set, ["foo"], "second"],
      [PatchType.Set, ["bar"], 42],
      [PatchType.Set, ["foo"], "hello"],
      [PatchType.Set, ["baz"], true],
    ];
    const deduped = dedupePatch(patch);
    expect(deduped).toEqual([
      [PatchType.Set, ["bar"], 42],
      [PatchType.Set, ["foo"], "hello"],
      [PatchType.Set, ["baz"], true],
    ]);
  });

  it("a set operation should dismiss past operations on the same path", () => {
    const patch: Patch = [
      [PatchType.Set, ["foo"], { first: "first" }],
      [PatchType.Remove, ["foo"]],
      [PatchType.Set, ["bar"], 42],
      [PatchType.Update, ["foo"], { second: "second" }],
      [PatchType.Set, ["foo"], "hello"],
    ];
    const deduped = dedupePatch(patch);
    expect(deduped).toEqual([
      [PatchType.Set, ["bar"], 42],
      [PatchType.Set, ["foo"], "hello"],
    ]);
  });

  it("a remove operation should dismiss past operations on the same path", () => {
    const patch: Patch = [
      [PatchType.Set, ["foo"], { first: "first" }],
      [PatchType.Remove, ["foo"]],
      [PatchType.Set, ["bar"], 42],
      [PatchType.Update, ["foo"], { second: "second" }],
      [PatchType.Remove, ["foo"]],
    ];
    const deduped = dedupePatch(patch);
    expect(deduped).toEqual([
      [PatchType.Set, ["bar"], 42],
      [PatchType.Remove, ["foo"]],
    ]);
  });

  it("an update operation should not dismiss past operations on the same path", () => {
    const patch: Patch = [
      [PatchType.Set, ["foo"], { first: "first" }],
      [PatchType.Update, ["foo"], { second: "second" }],
    ];
    const deduped = dedupePatch(patch);
    expect(deduped).toEqual([
      [PatchType.Set, ["foo"], { first: "first" }],
      [PatchType.Update, ["foo"], { second: "second" }],
    ]);
  });

  it("should handle nested paths correctly", () => {
    const patch: Patch = [
      [PatchType.Set, ["user", "name"], "Alice"],
      [PatchType.Set, ["user", "name"], "Bob"],
    ];
    const deduped = dedupePatch(patch);

    expect(deduped).toEqual([[PatchType.Set, ["user", "name"], "Bob"]]);
  });

  it("should handle numeric path segments", () => {
    const patch: Patch = [
      [PatchType.Set, ["list", 0, "val"], 10],
      [PatchType.Set, ["list", 1, "val"], 20],
      [PatchType.Set, ["list", 0, "val"], 30],
    ];
    const deduped = dedupePatch(patch);

    expect(deduped).toEqual([
      [PatchType.Set, ["list", 1, "val"], 20],
      [PatchType.Set, ["list", 0, "val"], 30],
    ]);
  });
});
