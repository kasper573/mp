import { describe, it, expect } from "vitest";
import {
  array,
  f32,
  i32,
  object,
  optional,
  Reader,
  string,
  transform,
  tuple,
  u32,
  u8,
  union,
  Writer,
} from "../src/index";

describe("composites", () => {
  it("object roundtrip, field order canonical", () => {
    const ty = object({ name: string(), age: u32() });
    const w = new Writer(32);
    ty.encode(w, { name: "alice", age: 30 });
    const r = new Reader(w.finish());
    expect(ty.decode(r)).toEqual({ name: "alice", age: 30 });
  });
  it("array roundtrip", () => {
    const ty = array(i32());
    const w = new Writer(32);
    ty.encode(w, [1, -2, 3, -4]);
    const r = new Reader(w.finish());
    expect(ty.decode(r)).toEqual([1, -2, 3, -4]);
  });
  it("tuple roundtrip", () => {
    const ty = tuple(u8(), string(), f32());
    const w = new Writer(32);
    ty.encode(w, [7, "hi", 1.25]);
    const r = new Reader(w.finish());
    const out = ty.decode(r);
    expect(out[0]).toBe(7);
    expect(out[1]).toBe("hi");
    expect(out[2]).toBeCloseTo(1.25);
  });
  it("optional present/absent", () => {
    const ty = optional(string());
    const w1 = new Writer(16);
    ty.encode(w1, "hello");
    expect(ty.decode(new Reader(w1.finish()))).toBe("hello");
    const w2 = new Writer(16);
    ty.encode(w2, undefined);
    expect(ty.decode(new Reader(w2.finish()))).toBeUndefined();
  });
  it("union roundtrip", () => {
    const ty = union({
      move: object({ dx: i32(), dy: i32() }),
      jump: object({ h: u32() }),
    });
    const w = new Writer(32);
    ty.encode(w, { tag: "jump", value: { h: 5 } });
    const r = new Reader(w.finish());
    expect(ty.decode(r)).toEqual({ tag: "jump", value: { h: 5 } });
  });
  it("transform roundtrip", () => {
    const ty = transform(
      u32(),
      (n) => `id:${n}`,
      (s) => Number(s.slice(3)),
    );
    const w = new Writer(16);
    ty.encode(w, "id:9");
    const r = new Reader(w.finish());
    expect(ty.decode(r)).toBe("id:9");
  });
  it("object signal proxy mutation marks dirty", () => {
    const ty = object({ x: i32(), y: i32() });
    const sig = ty.signal({ x: 1, y: 2 });
    let dirtyCount = 0;
    sig.setRoot({ dirty: false, onDirty: () => dirtyCount++ });
    const proxy = sig.value;
    proxy.x = 100;
    expect(dirtyCount).toBe(1);
    proxy.y = 200;
    expect(dirtyCount).toBe(1);
    expect(sig.peek()).toEqual({ x: 100, y: 200 });
  });
  it("tuple signal supports indexed writes", () => {
    const ty = tuple(i32(), i32());
    const sig = ty.signal([0, 0]);
    sig.setRoot({ dirty: false });
    const proxy = sig.value as unknown as number[];
    proxy[0] = 7;
    proxy[1] = 9;
    expect(proxy[0]).toBe(7);
    expect(proxy[1]).toBe(9);
  });
});
