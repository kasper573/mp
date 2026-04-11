import { describe, it, expect } from "vitest";
import { effect, signal } from "@preact/signals-core";
import { RiftWorld, Entity, RiftQuery, struct, f32, u32, tag } from "../index";
import type { EntityId } from "../entity";

const Position = struct({ x: f32(), y: f32() });
const Health = struct({ current: u32(), max: u32() });
const IsEnemy = tag();

describe("RiftWorld", () => {
  it("assigns stable numeric IDs to components based on array order", () => {
    const world = new RiftWorld({
      components: [Position, Health],
      events: [],
    });
    expect(world.getComponentId(Position)).toBe(0);
    expect(world.getComponentId(Health)).toBe(1);
  });

  it("assigns stable numeric IDs to events", () => {
    const Damage = struct({ amount: u32() });
    const world = new RiftWorld({
      components: [],
      events: [Damage],
    });
    expect(world.getEventId(Damage)).toBe(0);
  });

  it("throws on unregistered type", () => {
    const world = new RiftWorld({ components: [Position], events: [] });
    expect(() => world.getComponentId(Health)).toThrow();
  });

  it("can look up types by ID", () => {
    const world = new RiftWorld({
      components: [Position, Health],
      events: [],
    });
    expect(world.getComponentType(0)).toBe(Position);
    expect(world.getComponentType(1)).toBe(Health);
  });
});

describe("Entity", () => {
  it("add and has", () => {
    const e = new Entity(1);
    expect(e.has(Position)).toBe(false);
    e.set(Position, { x: 0, y: 0 });
    expect(e.has(Position)).toBe(true);
  });

  it("get returns a reactive proxy for structs", () => {
    const e = new Entity(1);
    e.set(Position, { x: 10, y: 20 });

    const pos = e.get(Position);
    expect(pos.x).toBeCloseTo(10);
    expect(pos.y).toBeCloseTo(20);

    // Writes through proxy
    pos.x = 42;
    const pos2 = e.get(Position);
    expect(pos2.x).toBeCloseTo(42);
  });

  it("get returns scalar value for non-struct types", () => {
    const Age = u32();
    const e = new Entity(1);
    e.set(Age, 25);
    expect(e.get(Age)).toBe(25);
  });

  it("set replaces entire value", () => {
    const e = new Entity(1);
    e.set(Health, { current: 100, max: 100 });
    e.set(Health, { current: 80, max: 100 });
    const hp = e.get(Health);
    expect(hp.current).toBe(80);
  });

  it("remove deletes component", () => {
    const e = new Entity(1);
    e.set(Position, { x: 0, y: 0 });
    e.remove(Position);
    expect(e.has(Position)).toBe(false);
  });

  it("tag components work with add/has", () => {
    const e = new Entity(1);
    e.set(IsEnemy);
    expect(e.has(IsEnemy)).toBe(true);
    e.remove(IsEnemy);
    expect(e.has(IsEnemy)).toBe(false);
  });

  it("signal() returns the raw signal for a component", () => {
    const Age = u32();
    const e = new Entity(1);
    e.set(Age, 10);
    const sig = e.signal(Age);
    expect(sig.value).toBe(10);
  });

  it("struct proxy reads are reactive via signals", () => {
    const e = new Entity(1);
    e.set(Position, { x: 0, y: 0 });

    const observed: number[] = [];
    const dispose = effect(() => {
      observed.push(e.get(Position).x);
    });

    // Effect should have run once with initial value
    expect(observed).toEqual([0]);

    // Mutate through proxy
    e.get(Position).x = 5;
    expect(observed).toEqual([0, 5]);

    dispose();
  });
});

describe("RiftQuery", () => {
  function makeQueryContext() {
    const version = signal(0);
    const entities = new Map<EntityId, Entity>();
    return { version, entities };
  }

  it("tracks entities matching component set", () => {
    const { version, entities } = makeQueryContext();

    const e1 = new Entity(1);
    e1.set(Position, { x: 0, y: 0 });
    e1.set(Health, { current: 100, max: 100 });
    entities.set(e1.id, e1);

    const e2 = new Entity(2);
    e2.set(Position, { x: 10, y: 10 });
    entities.set(e2.id, e2);

    version.value++;

    const query = new RiftQuery([Position, Health], version, entities);
    expect(query.value).toEqual([e1]);
  });

  it("emits onChange events", () => {
    const { version, entities } = makeQueryContext();
    const query = new RiftQuery([Position], version, entities);
    const events: Array<{ type: string; id: number }> = [];

    query.onChange((evt) => {
      events.push({ type: evt.type, id: evt.entity.id });
    });

    // Subscribe to make the computed eager
    const dispose = query.subscribe(() => {});

    const e = new Entity(1);
    e.set(Position, { x: 0, y: 0 });
    entities.set(e.id, e);
    version.value++;

    expect(events).toEqual([{ type: "added", id: 1 }]);

    e.remove(Position);
    version.value++;

    expect(events).toEqual([
      { type: "added", id: 1 },
      { type: "removed", id: 1 },
    ]);

    dispose();
  });

  it("is a signal — reactive reads work", () => {
    const { version, entities } = makeQueryContext();
    const query = new RiftQuery([Position], version, entities);
    const lengths: number[] = [];

    const dispose = effect(() => {
      lengths.push(query.value.length);
    });

    expect(lengths).toEqual([0]);

    const e = new Entity(1);
    e.set(Position, { x: 0, y: 0 });
    entities.set(e.id, e);
    version.value++;
    expect(lengths).toEqual([0, 1]);

    dispose();
  });

  it("unsubscribe from onChange works", () => {
    const { version, entities } = makeQueryContext();
    const query = new RiftQuery([Position], version, entities);
    const events: string[] = [];

    const dispose = query.subscribe(() => {});
    const unsub = query.onChange((evt) => events.push(evt.type));

    const e = new Entity(1);
    e.set(Position, { x: 0, y: 0 });
    entities.set(e.id, e);
    version.value++;
    expect(events).toEqual(["added"]);

    unsub();

    e.remove(Position);
    version.value++;
    expect(events).toEqual(["added"]);

    dispose();
  });
});
