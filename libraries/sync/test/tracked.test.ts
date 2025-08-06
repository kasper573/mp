// oxlint-disable consistent-type-definitions
import { effect } from "@mp/state";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEncoding } from "@mp/encoding";
import { SyncMap } from "../src/sync-map";
import { flushState, updateState } from "../src/sync-state";
import {
  flushTrackedInstance,
  object,
  updateTrackedInstance,
  value,
} from "../src/tracked";

describe("can flush and patch", () => {
  type State = {
    users: SyncMap<string, User>;
  };

  function createState(): State {
    return {
      users: new SyncMap<string, User>(),
    };
  }

  const User = object({
    name: value<string>(),
    cash: value<number>(),
  });
  type User = typeof User.$infer;

  let systemA: State;
  let systemB: State;

  beforeEach(() => {
    systemA = createState();
    systemB = createState();
  });

  it("can create entity instances", () => {
    const instance = User.create({ name: "John", cash: 100 });
    expect(instance).toMatchObject({
      name: "John",
      cash: 100,
    });
  });

  describe("map", () => {
    it("set", () => {
      // Assert that map set work in local system
      systemA.users.set("1", User.create({ name: "1", cash: 1 }));
      expect(systemA.users.get("1")).toMatchObject({ name: "1", cash: 1 });

      // Assert that flush and update works across systems
      const patch = flushState(systemA);
      systemB.users.set("2", User.create({ name: "2", cash: 2 }));
      updateState(systemB, patch);
      expect(systemB.users.size).toBe(2);
      expect(systemB.users.get("1")).toMatchObject({ name: "1", cash: 1 });
      expect(systemB.users.get("2")).toMatchObject({ name: "2", cash: 2 });
    });

    it("delete", () => {
      systemA.users.set("1", User.create({ name: "1", cash: 1 }));
      systemA.users.set("2", User.create({ name: "2", cash: 2 }));
      systemA.users.set("3", User.create({ name: "3", cash: 3 }));

      // Omit patch and manually update systemB to align with systemA before the deletes
      flushState(systemA);
      systemB.users.set("1", User.create({ name: "1", cash: 1 }));
      systemB.users.set("2", User.create({ name: "2", cash: 2 }));
      systemB.users.set("3", User.create({ name: "3", cash: 3 }));

      // Now delete the entity and flush to send a delete patch
      systemA.users.delete("2");
      const patch = flushState(systemA);
      updateState(systemB, patch);

      expect(systemB.users.get("1")).toMatchObject({ name: "1", cash: 1 });
      expect(systemB.users.get("2")).toBeUndefined();
      expect(systemB.users.get("3")).toMatchObject({ name: "3", cash: 3 });
    });

    it("clear", () => {
      systemA.users.set("1", User.create({ name: "1", cash: 1 }));
      systemA.users.set("2", User.create({ name: "2", cash: 2 }));
      systemA.users.set("3", User.create({ name: "3", cash: 3 }));

      // Omit patch and manually update systemB to align with systemA before the clear
      flushState(systemA);
      systemB.users.set("1", User.create({ name: "1", cash: 1 }));
      systemB.users.set("2", User.create({ name: "2", cash: 2 }));
      systemB.users.set("3", User.create({ name: "3", cash: 3 }));

      // Now clear the map and flush to send a clear patch
      systemA.users.clear();
      const patch = flushState(systemA);
      updateState(systemB, patch);
      expect(systemB.users.size).toBe(0);
    });

    it("flushing one entity produces a smaller patch than flushing two entities", () => {
      systemA.users.set("1", User.create({ name: "1", cash: 1 }));
      systemA.users.set("2", User.create({ name: "2", cash: 2 }));

      const patch1 = flushState(systemA);

      systemA.users.set("3", User.create({ name: "3", cash: 3 }));
      const patch2 = flushState(systemA);

      expect(sizeOf(patch2)).toBeLessThan(sizeOf(patch1));
    });

    it("double flush always yields empty patch", () => {
      systemA.users.set("1", User.create({ name: "1", cash: 1 }));
      flushState(systemA);
      const patch = flushState(systemA);
      expect(patch).toHaveLength(0);
    });
  });

  describe("component", () => {
    function startInstance() {
      return User.create({ name: "John", cash: 100 });
    }
    it("changes before adding to map", () => {
      const instance = startInstance();
      instance.name = "Jane";
      instance.cash = 200;

      systemA.users.set("1", instance);
      const patch = flushState(systemA);

      // Use a new instance in B to ensure we're not relying on changes
      // in the original instance and actually applying the patch
      systemB.users.set("1", startInstance());
      updateState(systemB, patch);

      expect(systemB.users.get("1")).toMatchObject({
        name: "Jane",
        cash: 200,
      });
    });

    it("changes after adding to map", () => {
      const instance = startInstance();
      systemA.users.set("1", instance);

      instance.name = "Jane";
      instance.cash = 200;

      const patch = flushState(systemA);

      // Use a new instance in B to ensure we're not relying on changes
      // in the original instance and actually applying the patch
      systemB.users.set("1", startInstance());
      updateState(systemB, patch);

      expect(systemB.users.get("1")).toMatchObject({
        name: "Jane",
        cash: 200,
      });
    });

    it("changing one component produces a smaller flush than changing two components", () => {
      const instance = startInstance();
      systemA.users.set("1", instance);
      instance.name = "Jane";
      const patch1 = flushState(systemA);

      instance.cash = 200;
      instance.name = "Foobar";
      const patch2 = flushState(systemA);

      expect(sizeOf(patch1)).toBeLessThan(sizeOf(patch2));
    });

    it("double flush always yields empty patch", () => {
      const instance = startInstance();
      instance.name = "Jane";
      instance.cash = 200;

      systemA.users.set("1", instance);
      flushState(systemA);
      const patch = flushState(systemA);

      expect(patch).toHaveLength(0);
    });
  });
});

describe("deeply nested state", () => {
  const Movement = object({
    x: value<number>(),
    y: value<number>(),
    speed: value<number>(),
  });

  const User = object({
    name: value<string>(),
    cash: value<number>(),
    movement: Movement,
  });
  type User = typeof User.$infer;

  type State = {
    users: SyncMap<string, User>;
  };

  function createState(): State {
    return {
      users: new SyncMap<string, User>(),
    };
  }

  let systemA: State;
  let systemB: State;

  beforeEach(() => {
    systemA = createState();
    systemB = createState();
  });

  function startInstance() {
    return User.create({
      name: "John",
      cash: 100,
      movement: { x: 10, y: 20, speed: 30 },
    });
  }

  it("can flush and patch", () => {
    const instance = startInstance();
    systemA.users.set("1", instance);

    let patch = flushState(systemA);
    updateState(systemB, patch);

    instance.movement.x = 20;
    instance.movement.y = 30;
    instance.movement.speed = 40;
    patch = flushState(systemA);

    // Use a new instance in B to ensure we're not relying on changes
    // in the original instance and actually applying the patch
    systemB.users.set("1", startInstance());
    updateState(systemB, patch);

    expect(systemB.users.get("1")).toMatchObject({
      name: "John",
      cash: 100,
      movement: { x: 20, y: 30, speed: 40 },
    });
  });

  it("double flush always yields empty patch", () => {
    const instance = startInstance();
    systemA.users.set("1", instance);
    instance.movement.x = 20;
    instance.movement.y = 30;
    instance.movement.speed = 40;

    flushState(systemA);
    const patch = flushState(systemA);

    expect(patch).toHaveLength(0);
  });

  describe("assigning to nested tracked instance", () => {
    it("instance is retained but mutated", () => {
      const instance = startInstance();
      const movementInstanceBefore = instance.movement;
      instance.movement = { x: 20, y: 30, speed: 40 };
      expect(instance.movement).toBe(movementInstanceBefore);
    });

    it("mutation becomes a patch", () => {
      const instance = startInstance();
      systemA.users.set("1", instance);

      let patch = flushState(systemA);
      updateState(systemB, patch);

      instance.movement = { x: 20, y: 30, speed: 40 };
      patch = flushState(systemA);

      // Use a new instance in B to ensure we're not relying on changes
      // in the original instance and actually applying the patch
      systemB.users.set("1", startInstance());
      updateState(systemB, patch);

      expect(systemB.users.get("1")).toMatchObject({
        name: "John",
        cash: 100,
        movement: { x: 20, y: 30, speed: 40 },
      });
    });
  });
});

it("can encode and decode", () => {
  const Thing = object({
    value: value<number>(),
  });
  type Thing = typeof Thing.$infer;

  const encoding = createEncoding<Thing>(99);

  const before = Thing.create({ value: 10 });
  const after = encoding.decode(encoding.encode(before))._unsafeUnwrap();
  expect(after.value).toBe(10);

  // If flushing is still successful that means the decode worked since flush only works on entity instances
  after.value = 20;
  const patch = flushTrackedInstance(after);
  expect(patch).toBeDefined();
});

it("properties are reactive", () => {
  const Counter = object({
    count: value<number>(),
  });

  const c = Counter.create({ count: 0 });

  const spy = vi.fn();
  effect(() => {
    spy(c.count);
  });

  c.count++;

  expect(spy).toHaveBeenNthCalledWith(1, 0);
  expect(spy).toHaveBeenNthCalledWith(2, 1);

  expect(c.count).toBe(1);
});

describe("property tracking optimization", () => {
  const Entity = object({
    value: value<number>({
      transform: (value) => parseFloat(value.toFixed(3)),
      filter: (a, b) => Math.floor(a) !== Math.floor(b),
    }),
  });

  it("can transform", () => {
    const e = Entity.create({ value: 10.123456789 });

    const changes = flushTrackedInstance(e);

    const e2 = Entity.create({ value: 0 });

    updateTrackedInstance(e2, changes!);

    expect(e2.value).toBe(10.123);
  });

  it("can filter", () => {
    const e = Entity.create({ value: 10 });

    flushTrackedInstance(e); // Flush and omit initial state change for test control

    e.value = 10.5; // Not a whole new number, should not trigger a patch

    expect(e.value).toBe(10.5); // But value should still be updated

    const flush1 = flushTrackedInstance(e);

    expect(flush1).toBeUndefined(); // No changes should be recorded

    e.value = 11; // Now a whole new number, should trigger a patch

    const flush2 = flushTrackedInstance(e);

    expect(flush2).toBeDefined();

    const e2 = Entity.create({ value: 0 });

    updateTrackedInstance(e2, flush2!);

    expect(e2.value).toBe(11);
  });
});

function sizeOf(arg: unknown): number {
  return JSON.stringify(arg).length;
}
