import { describe, it, expect } from "vitest";
import type { Patch } from "../src/patch";
import { dedupePatch } from "../src/patch-deduper";

describe("dedupePatch", () => {
  it("should return an empty patch when given []", () => {
    const original: Patch = [];
    const result = dedupePatch(original);
    expect(result).toEqual([]);
  });

  it("should preserve a patch with no duplicate paths", () => {
    const original: Patch = [
      [["a"], 1],
      [["b"], 2],
      [["c", "d"], 3],
    ];
    const deduped = dedupePatch(original);
    expect(deduped).toEqual(original);
  });

  it("should only keep last operations on the same path", () => {
    const patch: Patch = [
      [["foo"], "first"],
      [["foo"], "second"],
      [["bar"], 42],
      [["foo"], "hello"],
      [["baz"], true],
    ];
    const deduped = dedupePatch(patch);
    expect(deduped).toEqual([
      [["bar"], 42],
      [["foo"], "hello"],
      [["baz"], true],
    ]);
  });

  it("should handle nested paths correctly", () => {
    const patch: Patch = [
      [["user", "name"], "Alice"],
      [["user", "name"], "Bob"],
    ];
    const deduped = dedupePatch(patch);

    expect(deduped).toEqual([[["user", "name"], "Bob"]]);
  });

  it("should handle numeric path segments", () => {
    const patch: Patch = [
      [["list", 0, "val"], 10],
      [["list", 1, "val"], 20],
      [["list", 0, "val"], 30],
    ];
    const deduped = dedupePatch(patch);

    expect(deduped).toEqual([
      [["list", 1, "val"], 20],
      [["list", 0, "val"], 30],
    ]);
  });
});
