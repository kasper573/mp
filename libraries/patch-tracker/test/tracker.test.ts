// oxlint-disable no-explicit-any
import { PatchOpCode } from "@mp/patch";
import { beforeEach, describe, expect, it } from "vitest";
import type { ObjectNode, ObjectUnionNode } from "../src/graph";
import {
  TrackedArray,
  TrackedMap,
  TrackedObject,
  TrackedSet,
} from "../src/tracker";

// Helpers for patch comparison
const replaceOp = (path: string, value: unknown) => ({
  op: PatchOpCode.Replace,
  path,
  value,
});
const deleteOp = (path: string) => ({ op: PatchOpCode.Delete, path });

describe("TrackedObject", () => {
  let tracked: TrackedObject<{ a: number; b: { x: string } }>;
  const fooType: ObjectNode = {
    id: 1,
    type: "Object",
    properties: {
      a: { type: "Primitive" },
      b: {
        id: 2,
        type: "Object",
        properties: {
          x: { type: "Primitive" },
        },
      },
    },
  };

  beforeEach(() => {
    tracked = new TrackedObject(fooType, [], { a: 10, b: { x: "hello" } });
  });

  it("records top-level property replaces", () => {
    // @ts-expect-error Dangerous property access fine in tests
    tracked.a = 20;
    const patch = tracked.flush();
    expect(patch).toEqual([replaceOp("/a", 20)]);
  });

  it("flush resets recorded changes", () => {
    // @ts-expect-error Dangerous property access fine in tests
    tracked.a = 1;
    const first = tracked.flush();
    expect(first).toEqual([replaceOp("/a", 1)]);
    const second = tracked.flush();
    expect(second).toEqual([]);
  });

  it("applying patch reproduces state", () => {
    // @ts-expect-error Dangerous property access fine in tests
    tracked.a = 42;
    const patch = tracked.flush();
    const copy = { a: 10, b: { x: "hello" } };
    // applyPatch is imported from patchSystem
    // but here we manually apply for test simplicity
    patch.forEach((op) => {
      if (op.op === PatchOpCode.Replace) {
        const segments = op.path.slice(1).split("/");
        if (segments.length === 1) {
          (copy as any)[segments[0]] = op.value;
        }
      }
    });
    expect(copy).toEqual({ a: 42, b: { x: "hello" } });
  });
});

describe("TrackedObject with nested properties", () => {
  let tracked: TrackedObject<{ a: number; b: { x: string } }>;
  const fooType: ObjectNode = {
    id: 1,
    type: "Object",
    properties: {
      a: { type: "Primitive" },
      b: {
        id: 2,
        type: "Object",
        properties: { x: { type: "Primitive" } },
      },
    },
  };

  beforeEach(() => {
    tracked = new TrackedObject(fooType, [], { a: 10, b: { x: "hello" } });
  });

  it("records nested property replaces via nested .flush()", () => {
    const nested = (tracked as any).b as TrackedObject<{ x: string }>;
    // @ts-expect-error Dangerous property access fine in tests
    nested.x = "world";
    const patch = nested.flush();
    expect(patch).toEqual([replaceOp("/b/x", "world")]);
  });
});

describe("TrackedArray", () => {
  let arr: TrackedArray<unknown>;
  beforeEach(() => {
    arr = new TrackedArray([], [1, 2, 3]);
  });

  it("records push/pop/shift/unshift/splice", () => {
    arr.push(4);
    arr.pop();
    arr.shift();
    arr.unshift(0);
    arr.splice(1, 1, 9, 9);
    const patch = arr.flush();
    expect(patch.length).toBe(5);
    patch.forEach((op) => {
      expect(op.op).toBe(PatchOpCode.Replace);
      expect(op.path).toBe("");
      // @ts-expect-error Dangerous property access fine in tests
      expect(Array.isArray(op.value)).toBe(true);
    });
  });

  it("records index assignment via setIndex", () => {
    arr.setIndex(0, 10);
    const patch = arr.flush();
    expect(patch).toEqual([replaceOp("/0", 10)]);
  });

  it("records deletion via splice", () => {
    arr.splice(1, 1);
    const patch = arr.flush();
    expect(patch).toEqual([replaceOp("", [1, 3])]);
  });
});

describe("TrackedMap", () => {
  let m: TrackedMap<unknown, unknown>;
  beforeEach(() => {
    m = new TrackedMap([], new Map([["a", 1]]));
  });

  it("records set and delete", () => {
    m.set("b", 2);
    m.delete("a");
    const patch = m.flush();
    expect(patch).toEqual([replaceOp("/b", 2), deleteOp("/a")]);
  });
});

describe("TrackedSet", () => {
  let s: TrackedSet<unknown>;

  beforeEach(() => {
    s = new TrackedSet([], new Set(["x"]));
  });

  it("records add and delete", () => {
    s.add("y");
    s.delete("x");
    const patch = s.flush();
    expect(patch.length).toBe(2);
    expect(patch[0]).toEqual(replaceOp("", expect.arrayContaining(["x", "y"])));
    expect(patch[1]).toEqual(replaceOp("", expect.not.arrayContaining(["x"])));
  });
});

describe("Nested collections via TrackedObject", () => {
  it("records array inside object", () => {
    const objType: ObjectNode = {
      id: 1,
      type: "Object",
      properties: { arr: { type: "Array", value: { type: "Primitive" } } },
    };
    const obj = new TrackedObject(objType, [], { arr: [1, 2] });
    const arrWrap = (obj as any).arr as TrackedArray<unknown>;
    arrWrap.push(3);
    const patch = arrWrap.flush();
    expect(patch).toEqual([replaceOp("/arr", [1, 2, 3])]);
  });

  it("records Map inside object", () => {
    const objType: ObjectNode = {
      id: 1,
      type: "Object",
      properties: {
        m: {
          type: "Map",
          key: { type: "Primitive" },
          value: { type: "Primitive" },
        },
      },
    };
    const obj = new TrackedObject(objType, [], { m: new Map() });
    const mWrap = (obj as any).m as TrackedMap<unknown, unknown>;
    mWrap.set("k", 7);
    const patch = mWrap.flush();
    expect(patch).toEqual([replaceOp("/m/k", 7)]);
  });

  it("records Set inside object", () => {
    const objType: ObjectNode = {
      id: 1,
      type: "Object",
      properties: { s: { type: "Set", value: { type: "Primitive" } } },
    };
    const obj = new TrackedObject(objType, [], { s: new Set(["a"]) });
    const sWrap = (obj as any).s as TrackedSet<unknown>;
    sWrap.add("b");
    const patch = sWrap.flush();
    expect(patch).toEqual([replaceOp("/s", ["a", "b"])]);
  });
});

describe("TrackedObject with unions", () => {
  const memberA: ObjectNode = {
    id: 1,
    type: "Object",
    properties: { foo: { type: "Primitive" } },
  };
  const memberB: ObjectNode = {
    id: 2,
    type: "Object",
    properties: { bar: { type: "Primitive" } },
  };
  const unionType: ObjectUnionNode = {
    type: "Union",
    members: [memberA, memberB],
  };

  it("handles union where first member applies", () => {
    const u = new TrackedObject(unionType, [], { foo: 5 });
    // @ts-expect-error Dangerous property access fine in tests
    u.foo = 10;
    const patch = u.flush();
    expect(patch).toEqual([replaceOp("/foo", 10)]);
  });

  it("handles union where second member applies", () => {
    const u = new TrackedObject(unionType, [], { bar: "hi" } as any);
    // @ts-expect-error Dangerous property access fine in tests
    u.bar = "bye";
    const patch = u.flush();
    expect(patch).toEqual([replaceOp("/bar", "bye")]);
  });
});
