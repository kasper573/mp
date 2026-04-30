import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { defineSchema } from "../src/index";
import { createWorld } from "../src/world";
import { f32, object, string, u32 } from "@rift/types";

function sha256(input: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(input).digest());
}

const pos = object({ x: f32(), y: f32() });
const name = string();
const health = u32();

const schema = defineSchema({
  components: [pos, name, health],
  events: [],
  hash: sha256,
});

describe("world", () => {
  it("create allocates incrementing ids", () => {
    const w = createWorld(schema);
    const a = w.create();
    const b = w.create();
    expect(b).toBeGreaterThan(a);
  });
  it("destroy removes entity", () => {
    const w = createWorld(schema);
    const id = w.create();
    expect(w.exists(id)).toBe(true);
    w.destroy(id);
    expect(w.exists(id)).toBe(false);
  });
  it("add/has/get/remove components", () => {
    const w = createWorld(schema);
    const id = w.create();
    w.add(id, pos, { x: 1, y: 2 });
    expect(w.has(id, pos)).toBe(true);
    const p = w.get(id, pos);
    expect(p?.x).toBe(1);
    expect(p?.y).toBe(2);
    w.remove(id, pos);
    expect(w.has(id, pos)).toBe(false);
  });
  it("add without initial uses default", () => {
    const w = createWorld(schema);
    const id = w.create();
    w.add(id, health);
    expect(w.get(id, health)).toBe(0);
  });
  it("query returns matching entities", () => {
    const w = createWorld(schema);
    const a = w.create();
    w.add(a, pos, { x: 0, y: 0 });
    w.add(a, name, "A");
    const b = w.create();
    w.add(b, pos, { x: 1, y: 1 });
    const rows = w.query(pos).toArray();
    expect(rows.length).toBe(2);
    const withName = w.query(pos, name).toArray();
    expect(withName.length).toBe(1);
    expect(withName[0][0]).toBe(a);
  });
  it("query exclude chains", () => {
    const w = createWorld(schema);
    const a = w.create();
    w.add(a, pos, { x: 0, y: 0 });
    w.add(a, name, "A");
    const b = w.create();
    w.add(b, pos, { x: 1, y: 1 });
    const rows = w.query(pos).exclude(name).toArray();
    expect(rows.length).toBe(1);
    expect(rows[0][0]).toBe(b);
  });
  it("query is iterable", () => {
    const w = createWorld(schema);
    const a = w.create();
    w.add(a, pos, { x: 0, y: 0 });
    const b = w.create();
    w.add(b, pos, { x: 1, y: 1 });
    const ids: number[] = [];
    for (const row of w.query(pos)) {
      ids.push(row[0]);
    }
    function numCmp(x: number, y: number): number {
      return x - y;
    }
    expect(ids.sort(numCmp)).toEqual([a, b].sort(numCmp));
  });
  it("add throws if component already exists", () => {
    const w = createWorld(schema);
    const id = w.create();
    w.add(id, health, 10);
    expect(() => w.add(id, health, 20)).toThrow();
  });
  it("set updates existing component value", () => {
    const w = createWorld(schema);
    const id = w.create();
    w.add(id, health, 10);
    w.set(id, health, 42);
    expect(w.get(id, health)).toBe(42);
  });
  it("set throws if component missing", () => {
    const w = createWorld(schema);
    const id = w.create();
    expect(() => w.set(id, health, 1)).toThrow();
  });
  it("query size reflects entity count", () => {
    const w = createWorld(schema);
    const a = w.create();
    const b = w.create();
    w.add(a, pos, { x: 0, y: 0 });
    w.add(b, pos, { x: 1, y: 1 });
    w.add(a, health, 100);
    expect(w.query(pos).size).toBe(2);
    expect(w.query(health).size).toBe(1);
    w.remove(a, pos);
    expect(w.query(pos).size).toBe(1);
    w.destroy(b);
    expect(w.query(pos).size).toBe(0);
  });
});
