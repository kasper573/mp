import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  ComponentAdded,
  ComponentChanged,
  ComponentRemoved,
  defineSchema,
  EntityCreated,
  EntityDestroyed,
  World,
} from "../src/index";
import { f32, object, string, u32 } from "@rift/types";
import type { EntityId } from "../src/protocol";
import type { RiftType } from "@rift/types";

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
    const w = new World(schema);
    const a = w.create();
    const b = w.create();
    expect(b).toBeGreaterThan(a);
  });
  it("create with explicit id records and bumps nextId", () => {
    const w = new World(schema);
    const explicit = w.create(50 as EntityId);
    expect(explicit).toBe(50);
    expect(w.exists(50 as EntityId)).toBe(true);
    const next = w.create();
    expect(next).toBeGreaterThan(50);
  });
  it("destroy removes entity and clears its components", () => {
    const w = new World(schema);
    const id = w.create();
    w.add(id, pos, { x: 1, y: 2 });
    expect(w.exists(id)).toBe(true);
    w.destroy(id);
    expect(w.exists(id)).toBe(false);
    expect(w.has(id, pos)).toBe(false);
  });
  it("add/has/get/remove components", () => {
    const w = new World(schema);
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
    const w = new World(schema);
    const id = w.create();
    w.add(id, health);
    expect(w.get(id, health)).toBe(0);
  });
  it("query returns matching entities", () => {
    const w = new World(schema);
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
    const w = new World(schema);
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
    const w = new World(schema);
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
    const w = new World(schema);
    const id = w.create();
    w.add(id, health, 10);
    expect(() => w.add(id, health, 20)).toThrow();
  });
  it("write updates fields via shallow merge", () => {
    const w = new World(schema);
    const id = w.create();
    w.add(id, pos, { x: 1, y: 2 });
    w.write(id, pos, { x: 42 });
    expect(w.get(id, pos)).toEqual({ x: 42, y: 2 });
  });
  it("write throws if component missing", () => {
    const w = new World(schema);
    const id = w.create();
    expect(() => w.write(id, health, 1 as never)).toThrow();
  });
  it("query size reflects entity count", () => {
    const w = new World(schema);
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

describe("pool change tracking", () => {
  it("add records into added; clearChanges drains it", () => {
    const w = new World(schema);
    const id = w.create();
    w.add(id, pos, { x: 0, y: 0 });
    expect(w.pool(pos).added.has(id)).toBe(true);
    expect(w.pool(pos).dirty.has(id)).toBe(false);
    w.clearChanges();
    expect(w.pool(pos).added.size).toBe(0);
  });
  it("write records into dirty (not added) after a flush", () => {
    const w = new World(schema);
    const id = w.create();
    w.add(id, pos, { x: 0, y: 0 });
    w.clearChanges();
    w.write(id, pos, { x: 1 });
    expect(w.pool(pos).added.has(id)).toBe(false);
    expect(w.pool(pos).dirty.has(id)).toBe(true);
  });
  it("write within the same flush as add stays in added (no dirty)", () => {
    const w = new World(schema);
    const id = w.create();
    w.add(id, pos, { x: 0, y: 0 });
    w.write(id, pos, { x: 1 });
    expect(w.pool(pos).added.has(id)).toBe(true);
    expect(w.pool(pos).dirty.has(id)).toBe(false);
  });
  it("remove records into removed when component existed before flush", () => {
    const w = new World(schema);
    const id = w.create();
    w.add(id, pos, { x: 0, y: 0 });
    w.clearChanges();
    w.remove(id, pos);
    expect(w.pool(pos).removed.has(id)).toBe(true);
  });
  it("add+remove within one flush nets to nothing observable", () => {
    const w = new World(schema);
    const id = w.create();
    w.add(id, pos, { x: 0, y: 0 });
    w.remove(id, pos);
    expect(w.pool(pos).added.has(id)).toBe(false);
    expect(w.pool(pos).removed.has(id)).toBe(false);
    expect(w.pool(pos).dirty.has(id)).toBe(false);
  });
  it("destroy emits componentRemoved for each existing component", () => {
    const w = new World(schema);
    const id = w.create();
    w.add(id, pos, { x: 0, y: 0 });
    w.add(id, health, 10);
    w.clearChanges();
    w.destroy(id);
    expect(w.pool(pos).removed.has(id)).toBe(true);
    expect(w.pool(health).removed.has(id)).toBe(true);
  });
});

describe("world events", () => {
  it("emits ComponentAdded / ComponentChanged / ComponentRemoved", () => {
    const w = new World(schema);
    const id = w.create();
    const events: Array<{ kind: string; type: RiftType }> = [];
    w.on(ComponentAdded, ({ type }) => events.push({ kind: "added", type }));
    w.on(ComponentChanged, ({ type }) =>
      events.push({ kind: "changed", type }),
    );
    w.on(ComponentRemoved, ({ type }) =>
      events.push({ kind: "removed", type }),
    );
    w.add(id, pos, { x: 0, y: 0 });
    w.write(id, pos, { x: 1 });
    w.remove(id, pos);
    expect(events).toEqual([
      { kind: "added", type: pos },
      { kind: "changed", type: pos },
      { kind: "removed", type: pos },
    ]);
  });
  it("emits EntityCreated / EntityDestroyed", () => {
    const w = new World(schema);
    const events: string[] = [];
    w.on(EntityCreated, ({ id }) => events.push(`c:${id}`));
    w.on(EntityDestroyed, ({ id }) => events.push(`d:${id}`));
    const id = w.create();
    w.destroy(id);
    expect(events).toEqual([`c:${id}`, `d:${id}`]);
  });
  it("listener returned unsubscribe stops further events", () => {
    const w = new World(schema);
    const events: number[] = [];
    const off = w.on(EntityCreated, ({ id }) => events.push(id));
    w.create();
    off();
    w.create();
    expect(events.length).toBe(1);
  });
});
