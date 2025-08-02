// test/tracker.test.ts
// oxlint-disable no-explicit-any
import type { Operation } from "@mp/patch";
import { PatchOpCode } from "@mp/patch";
import { beforeEach, describe, expect, it } from "vitest";
import {
  TrackedArray,
  TrackedMap,
  TrackedObject,
  TrackedSet,
} from "../src/tracker";

describe("TrackedObject", () => {
  interface TestObj {
    a: number;
    b: string;
  }

  let obj: TestObj;
  let tracked: TrackedObject<TestObj>;
  let outPatch: Operation[];

  beforeEach(() => {
    obj = { a: 1, b: "initial" };
    tracked = new TrackedObject<TestObj>(["a", "b"], obj);
    outPatch = [];
  });

  it("should update underlying object when setting a property", () => {
    (tracked as any).a = 42;
    expect(obj.a).toBe(42);
    (tracked as any).b = "changed";
    expect(obj.b).toBe("changed");
  });

  it("should record patches for property sets", () => {
    (tracked as any).a = 100;
    (tracked as any).b = "foo";
    const patch = tracked.flush();
    expect(patch).toEqual([
      { op: PatchOpCode.Replace, path: "/a", value: 100 },
      { op: PatchOpCode.Replace, path: "/b", value: "foo" },
    ]);
  });

  it("should clear internal patch after flushing", () => {
    (tracked as any).a = 5;
    tracked.flush(undefined, outPatch);
    expect(outPatch).toHaveLength(1);
    // Second flush returns empty and does not modify outPatch
    const second = tracked.flush();
    expect(second).toEqual([]);
    expect(outPatch).toHaveLength(1);
  });

  it("should apply prefix to paths when flushing", () => {
    (tracked as any).b = "prefixed";
    const prefix: (string | number)[] = ["root", 0];
    tracked.flush(prefix, outPatch);
    expect(outPatch).toEqual([
      { op: PatchOpCode.Replace, path: "/root/0/b", value: "prefixed" },
    ]);
  });
});

describe("TrackedArray", () => {
  let arr: TrackedArray<number>;

  beforeEach(() => {
    arr = new TrackedArray<number>();
  });

  it("push should add elements and record patch", () => {
    arr.push(1, 2);
    expect(arr).toEqual([1, 2]);
    const patch = arr.flush();
    expect(patch).toEqual([
      { op: PatchOpCode.Replace, path: "", value: [1, 2] },
    ]);
  });

  it("pop should remove last element and record patch", () => {
    // construct with initial items so no push‐patch is recorded
    arr = new TrackedArray<number>(1, 2, 3);
    const popped = arr.pop();
    expect(popped).toBe(3);
    expect(arr).toEqual([1, 2]);
    const patch = arr.flush();
    expect(patch).toEqual([
      { op: PatchOpCode.Replace, path: "", value: [1, 2] },
    ]);
  });

  it("shift should remove first element and record patch", () => {
    arr = new TrackedArray<number>(10, 20);
    const shifted = arr.shift();
    expect(shifted).toBe(10);
    expect(arr).toEqual([20]);
    const patch = arr.flush();
    expect(patch).toEqual([{ op: PatchOpCode.Replace, path: "", value: [20] }]);
  });

  it("unshift should add elements at front and record patch", () => {
    arr.unshift(5);
    expect(arr).toEqual([5]);
    const patch = arr.flush();
    expect(patch).toEqual([{ op: PatchOpCode.Replace, path: "", value: [5] }]);
  });

  it("splice should modify array and record patch", () => {
    arr = new TrackedArray<number>(1, 2, 3);
    const removed = arr.splice(1, 1, 4, 5);
    expect(removed).toEqual([2]);
    expect(arr).toEqual([1, 4, 5, 3]);
    const patch = arr.flush();
    expect(patch).toEqual([
      { op: PatchOpCode.Replace, path: "", value: [1, 4, 5, 3] },
    ]);
  });
});

describe("TrackedMap", () => {
  let map: TrackedMap<string, number>;
  let outPatch: Operation[];

  beforeEach(() => {
    map = new TrackedMap<string, number>([["x", 1] as any]);
    outPatch = [];
  });

  it("set should add or update entry and record patch", () => {
    map.set("a", 10);
    expect(map.get("a")).toBe(10);
    map.flush(undefined, outPatch);
    expect(outPatch[0]).toEqual({
      op: PatchOpCode.Replace,
      path: "/a",
      value: 10,
    });
  });

  it("delete should remove entry and record patch", () => {
    // initialize with "b" so there's no prior set-patch
    map = new TrackedMap<string, number>([["b", 2] as any]);
    const deleted = map.delete("b");
    expect(deleted).toBe(true);
    const patch = map.flush();
    expect(patch).toEqual([{ op: PatchOpCode.Delete, path: "/b" }]);
  });

  it("flush with prefix should apply prefix", () => {
    map.set("c", 3);
    map.flush(["root"], outPatch);
    expect(outPatch).toEqual([
      { op: PatchOpCode.Replace, path: "/root/c", value: 3 },
    ]);
  });
});

describe("TrackedSet", () => {
  let set: TrackedSet<number>;
  let outPatch: Operation[];

  beforeEach(() => {
    set = new TrackedSet<number>(new Set([1, 2]));
    outPatch = [];
  });

  it("add should include element and record patch", () => {
    set.add(3);
    expect(Array.from(set)).toEqual(expect.arrayContaining([1, 2, 3]));
    set.flush(undefined, outPatch);
    expect(outPatch[0]).toEqual({
      op: PatchOpCode.Replace,
      path: "",
      value: Array.from(set),
    });
  });

  it("delete should remove element and record patch", () => {
    const removed = set.delete(2);
    expect(removed).toBe(true);
    expect(set.has(2)).toBe(false);
    set.flush(undefined, outPatch);
    expect(outPatch[0]).toEqual({
      op: PatchOpCode.Replace,
      path: "",
      value: Array.from(set),
    });
  });
});
