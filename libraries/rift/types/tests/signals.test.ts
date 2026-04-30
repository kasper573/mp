import { describe, it, expect } from "vitest";
import {
  array,
  f32,
  i32,
  object,
  optional,
  string,
  tuple,
  u32,
  union,
} from "../src/index";

describe("signals", () => {
  it("leaf set with same value does not mark dirty", () => {
    const sig = i32().signal(0);
    let count = 0;
    sig.setRoot({ dirty: false, onDirty: () => count++ });
    sig.set(0);
    expect(count).toBe(0);
    sig.set(1);
    expect(count).toBe(1);
  });
  it("leaf dirty is cleared by clearDirty", () => {
    const sig = i32().signal(0);
    sig.setRoot({ dirty: false });
    sig.set(5);
    expect(sig.dirty).toBe(true);
    sig.clearDirty();
    expect(sig.dirty).toBe(false);
  });
  it("object mutations bubble once per flush", () => {
    const ty = object({ x: i32(), y: i32(), z: i32() });
    const sig = ty.signal({ x: 0, y: 0, z: 0 });
    let count = 0;
    sig.setRoot({ dirty: false, onDirty: () => count++ });
    const p = sig.value;
    p.x = 1;
    p.y = 2;
    p.z = 3;
    expect(count).toBe(1);
    sig.clearDirty();
    p.x = 10;
    expect(count).toBe(2);
  });
  it("nested object bubbles through parent root", () => {
    const ty = object({ inner: object({ a: f32(), b: f32() }) });
    const sig = ty.signal({ inner: { a: 0, b: 0 } });
    let count = 0;
    sig.setRoot({ dirty: false, onDirty: () => count++ });
    const inner = sig.value.inner as { a: number; b: number };
    inner.a = 1.5;
    expect(count).toBe(1);
  });
  it("array set marks dirty", () => {
    const ty = array(i32());
    const sig = ty.signal([]);
    let count = 0;
    sig.setRoot({ dirty: false, onDirty: () => count++ });
    sig.set([1, 2, 3]);
    expect(count).toBe(1);
  });
  it("optional present/absent transitions", () => {
    const ty = optional(string());
    const sig = ty.signal("hi");
    let count = 0;
    sig.setRoot({ dirty: false, onDirty: () => count++ });
    expect(sig.value).toBe("hi");
    sig.set(undefined);
    expect(sig.value).toBeUndefined();
    expect(count).toBeGreaterThan(0);
  });
  it("union set changes tag and value", () => {
    const ty = union({
      move: object({ dx: i32() }),
      jump: object({ h: u32() }),
    });
    const sig = ty.signal({ tag: "move", value: { dx: 1 } });
    let count = 0;
    sig.setRoot({ dirty: false, onDirty: () => count++ });
    sig.set({ tag: "jump", value: { h: 2 } });
    expect(sig.value.tag).toBe("jump");
    expect(count).toBe(1);
  });
  it("tuple indexed set marks dirty once per write", () => {
    const ty = tuple(i32(), i32(), i32());
    const sig = ty.signal([0, 0, 0]);
    let count = 0;
    sig.setRoot({ dirty: false, onDirty: () => count++ });
    const p = sig.value as unknown as number[];
    p[0] = 1;
    p[1] = 2;
    p[2] = 3;
    expect(count).toBe(1);
  });
});
