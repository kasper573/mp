import { applyPatch } from "@mp/patch";
import { describe, expect, it } from "vitest";
import {
  defineTrackedObject,
  TrackedArray,
  TrackedMap,
  TrackedSet,
} from "../src/tracker";

interface EO {
  a: number;
  b: string;
}
const EOTracked = defineTrackedObject<EO>(["a", "b"]);

describe("TrackedObject", () => {
  interface TestObj {
    foo: number;
    bar: string;
  }

  const TestObj = defineTrackedObject<TestObj>(["foo", "bar"]);

  it("supports changing properties", () => {
    const tracked = new TestObj({ foo: 1, bar: "initial" });
    tracked.foo = 42;
    expect(tracked.foo).toBe(42);
    tracked.bar = "changed";
    expect(tracked.bar).toBe("changed");
  });

  it("should record patches for property sets", () => {
    const tracked = new TestObj({ foo: 1, bar: "initial" });
    tracked.foo = 100;
    tracked.bar = "foo";
    const patch = tracked.flush();
    const target = { foo: 1, bar: "initial" };
    applyPatch(target, patch);
    expect(target.foo).toBe(100);
    expect(target.bar).toBe("foo");
  });

  it("should clear internal patch after flushing", () => {
    const tracked = new TestObj({ foo: 1, bar: "initial" });
    tracked.foo = 5;
    const first = tracked.flush();
    expect(first).toHaveLength(1);
    const second = tracked.flush();
    expect(second).toEqual([]);
    expect(first).toHaveLength(1);
  });

  it("should apply prefix to paths when flushing", () => {
    const tracked = new TestObj({ foo: 1, bar: "initial" });
    tracked.bar = "changed";
    const patch = tracked.flush(["nested"]);
    const target: { nested: TestObj } = { nested: { foo: 1, bar: "initial" } };
    applyPatch(target, patch);
    expect(target.nested.bar).toBe("changed");
  });

  it("flush without any changes leaves target untouched", () => {
    const t = new EOTracked({ a: 1, b: "x" });
    const target = { a: 1, b: "x" };
    applyPatch(target, t.flush());
    expect(target).toEqual({ a: 1, b: "x" });
  });

  it("setting to the same value still applies an assign", () => {
    const t = new EOTracked({ a: 1, b: "x" });
    t.a = 1;
    const target = { a: 0, b: "" };
    applyPatch(target, t.flush());
    expect(target.a).toBe(1);
    expect(target.b).toBe("");
  });

  it("multiple flushes with different prefixes work by side-effect", () => {
    const t = new EOTracked({ a: 5, b: "z" });
    t.a = 9;
    const tgt1 = { x: { a: 5, b: "z" } as EO };
    applyPatch(tgt1, t.flush(["x"]));
    expect(tgt1.x.a).toBe(9);

    t.b = "y";
    const tgt2 = { y: { a: 9, b: "z" } as EO };
    applyPatch(tgt2, t.flush(["y"]));
    expect(tgt2.y.b).toBe("y");
  });
});

describe("TrackedArray", () => {
  it("push should add elements and record patch", () => {
    const arr = new TrackedArray<number>();
    arr.push(1, 2);
    expect(arr).toEqual([1, 2]);
    const patch = arr.flush();
    const target: number[] = [];
    applyPatch(target, patch);
    expect(target).toEqual([1, 2]);
  });

  it("pop should remove last element and record patch", () => {
    const arr = new TrackedArray<number>(1, 2, 3);
    const popped = arr.pop();
    expect(popped).toBe(3);
    expect(arr).toEqual([1, 2]);
    const patch = arr.flush();
    const target: number[] = [1, 2, 3];
    applyPatch(target, patch);
    expect(target).toEqual([1, 2]);
  });

  it("shift should remove first element and record patch", () => {
    const arr = new TrackedArray<number>(10, 20);
    const shifted = arr.shift();
    expect(shifted).toBe(10);
    expect(arr).toEqual([20]);
    const patch = arr.flush();
    const target = [10, 20];
    applyPatch(target, patch);
    expect(target).toEqual([20]);
  });

  it("unshift should add elements at front and record patch", () => {
    const arr = new TrackedArray<number>(2, 3);
    arr.unshift(5);
    expect(arr).toEqual([5, 2, 3]);
    const patch = arr.flush();
    const target: number[] = [2, 3];
    applyPatch(target, patch);
    expect(target).toEqual([5, 2, 3]);
  });

  it("splice should modify array and record patch", () => {
    const arr = new TrackedArray<number>(1, 2, 3);
    const removed = arr.splice(1, 1, 4, 5);
    expect(removed).toEqual([2]);
    expect(arr).toEqual([1, 4, 5, 3]);
    const patch = arr.flush();
    const target: number[] = [1, 2, 3];
    applyPatch(target, patch);
    expect(target).toEqual([1, 4, 5, 3]);
  });
  it("flush twice: only first change applies", () => {
    const arr = new TrackedArray<number>(1, 2);
    arr.push(3);
    const tgt1: number[] = [];
    applyPatch(tgt1, arr.flush());
    expect(tgt1).toEqual([1, 2, 3]);

    const tgt2: number[] = [];
    applyPatch(tgt2, arr.flush());
    expect(tgt2).toEqual([]); // no second change
  });

  it("direct index assignment is not tracked", () => {
    const arr = new TrackedArray<number>(10, 20);
    arr[0] = 99;
    const tgt: number[] = [0, 0];
    applyPatch(tgt, arr.flush());
    expect(tgt).toEqual([0, 0]); // unchanged
  });

  it("non-overridden methods do not produce a patch", () => {
    const arr = new TrackedArray<number>(3, 1, 2);
    arr.sort(); // inherited
    const tgt: number[] = [];
    applyPatch(tgt, arr.flush());
    expect(tgt).toEqual([]); // no patch
  });

  it("pop on empty array still replaces entire array", () => {
    const arr = new TrackedArray<number>();
    arr.pop();
    const tgt = [42];
    applyPatch(tgt, arr.flush());
    expect(tgt).toEqual([]); // replaced with []
  });
});

describe("TrackedMap", () => {
  it("set should add or update entry and record patch", () => {
    const map = new TrackedMap<string, number>();
    map.set("foo", 10);
    expect(map.get("foo")).toBe(10);
    const patch = map.flush();
    const target = new Map();
    applyPatch(target, patch);
    expect(target.get("foo")).toBe(10);
  });

  it("delete should remove entry and record patch", () => {
    const map = new TrackedMap<string, number>([["bar", 2]]);
    const deleted = map.delete("bar");
    expect(deleted).toBe(true);
    const patch = map.flush();
    const target = new Map([["bar", 2]]);
    applyPatch(target, patch);
    expect(target.has("bar")).toBe(false);
  });

  it("flush with prefix should apply prefix", () => {
    const map = new TrackedMap<string, number>([["baz", 3]]);
    map.set("qux", 4);
    const patch = map.flush(["nested"]);
    const target = { nested: new Map<string, number>() };
    applyPatch(target, patch);
    expect(target.nested.get("qux")).toBe(4);
  });

  it("initial entries do not emit patch", () => {
    const m = new TrackedMap<string, number>([["k", 1]]);
    const tgt = new Map<string, number>([["k", 9]]);
    applyPatch(tgt, m.flush());
    expect(tgt.get("k")).toBe(9);
  });

  it("inherited clear does not track", () => {
    const m = new TrackedMap<string, number>([["a", 1]]);
    m.clear();
    const tgt = new Map<string, number>([["a", 9]]);
    applyPatch(tgt, m.flush());
    expect(tgt.get("a")).toBe(9);
  });

  it("set then delete yields only delete effect", () => {
    const m = new TrackedMap<string, number>();
    m.set("x", 10);
    m.delete("x");
    const tgt = new Map<string, number>([["x", 5]]);
    applyPatch(tgt, m.flush());
    expect(tgt.has("x")).toBe(false);
  });

  it("delete then set yields only set effect", () => {
    const m = new TrackedMap<string, number>([["y", 2]]);
    m.delete("y");
    m.set("y", 3);
    const tgt = new Map<string, number>([["y", 2]]);
    applyPatch(tgt, m.flush());
    expect(tgt.get("y")).toBe(3);
  });

  it("flush twice: only first effects target", () => {
    const m = new TrackedMap<string, string>();
    m.set("foo", "bar");
    const tgt1 = new Map<string, string>();
    applyPatch(tgt1, m.flush());
    expect(tgt1.get("foo")).toBe("bar");

    const tgt2 = new Map<string, string>();
    applyPatch(tgt2, m.flush());
    expect(tgt2.has("foo")).toBe(false);
  });
});

describe("TrackedSet", () => {
  it("add should include element and record patch", () => {
    const set = new TrackedSet<number>([1]);
    set.add(2);
    expect(set.has(2)).toBe(true);
    const patch = set.flush();
    const target = new Set<number>([1]);
    applyPatch(target, patch);
    expect(target.has(2)).toBe(true);
  });

  it("delete should remove element and record patch", () => {
    const set = new TrackedSet<number>([1, 2]);
    const deleted = set.delete(1);
    expect(deleted).toBe(true);
    expect(set.has(1)).toBe(false);
    const patch = set.flush();
    const target = new Set<number>([1, 2]);
    applyPatch(target, patch);
    expect(target.has(1)).toBe(false);
  });

  it("initial values do not emit a patch", () => {
    const s = new TrackedSet<number>([1, 2, 3]);
    const tgt = new Set<number>([9]);
    applyPatch(tgt, s.flush());
    expect(Array.from(tgt)).toEqual([9]);
  });

  it("adding duplicate still replaces full set", () => {
    const s = new TrackedSet<number>([1, 2]);
    s.add(2);
    const tgt = new Set<number>([9]);
    applyPatch(tgt, s.flush());
    expect(new Set(tgt)).toEqual(new Set([1, 2]));
  });

  it("deleting non-existent still emits full replace", () => {
    const s = new TrackedSet<string>(["x"]);
    s.delete("y");
    const tgt = new Set<string>(["x", "y"]);
    applyPatch(tgt, s.flush());
    expect(new Set(tgt)).toEqual(new Set(["x"]));
  });

  it("inherited clear does not track", () => {
    const s = new TrackedSet<number>([4, 5]);
    s.clear();
    const tgt = new Set<number>([100]);
    applyPatch(tgt, s.flush());
    expect(new Set(tgt)).toEqual(new Set([100]));
  });

  it("flush twice: only first replace applies", () => {
    const s = new TrackedSet<number>();
    s.add(1);
    const tgt1 = new Set<number>();
    applyPatch(tgt1, s.flush());
    expect(new Set(tgt1)).toEqual(new Set([1]));

    const tgt2 = new Set<number>();
    applyPatch(tgt2, s.flush());
    expect(new Set(tgt2)).toEqual(new Set()); // no second replace
  });
});
