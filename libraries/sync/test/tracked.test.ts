// oxlint-disable consistent-type-definitions
import { effect } from "@mp/state";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addEncoderExtension, createEncoding } from "@mp/encoding";
import { SyncMap } from "../src/sync-map";
import { flushState, updateState } from "../src/sync-state";
import {
  flushTrackedInstance,
  object,
  prop,
  updateTrackedInstance,
} from "../src/tracked";

function sizeOf(arg: unknown): number {
  return JSON.stringify(arg).length;
}

describe("Basic sync", () => {
  const User = object({
    name: prop<string>(),
    cash: prop<number>(),
  });
  type User = typeof User.$infer;

  function makeState() {
    return { users: new SyncMap<string, User>() };
  }

  let systemA: ReturnType<typeof makeState>;
  let systemB: ReturnType<typeof makeState>;

  beforeEach(() => {
    systemA = makeState();
    systemB = makeState();
  });

  describe("Instance creation & initial flush", () => {
    it("should create entity instances", () => {
      const inst = User.create({ name: "John", cash: 100 });
      expect(inst).toMatchObject({ name: "John", cash: 100 });
    });

    it("initial tracked instance flushes as patch", () => {
      const inst = User.create({ name: "John", cash: 100 });
      const patch = flushTrackedInstance(inst);
      expect(patch).toBeDefined();
    });
  });

  describe("SyncMap operations", () => {
    it("should add entries and synchronize across systems", () => {
      systemA.users.set("1", User.create({ name: "1", cash: 1 }));
      expect(systemA.users.get("1")).toMatchObject({ name: "1", cash: 1 });

      const patch = flushState(systemA);
      systemB.users.set("2", User.create({ name: "2", cash: 2 }));
      updateState(systemB, patch);

      expect(systemB.users.size).toBe(2);
      expect(systemB.users.get("1")).toMatchObject({ name: "1", cash: 1 });
      expect(systemB.users.get("2")).toMatchObject({ name: "2", cash: 2 });
    });

    it("should remove entries across systems", () => {
      ["1", "2", "3"].forEach((id, i) =>
        systemA.users.set(id, User.create({ name: id, cash: i + 1 })),
      );

      flushState(systemA);
      ["1", "2", "3"].forEach((id, i) =>
        systemB.users.set(id, User.create({ name: id, cash: i + 1 })),
      );

      systemA.users.delete("2");
      const patch = flushState(systemA);
      updateState(systemB, patch);

      expect(systemB.users.get("1")).toMatchObject({ name: "1", cash: 1 });
      expect(systemB.users.get("2")).toBeUndefined();
      expect(systemB.users.get("3")).toMatchObject({ name: "3", cash: 3 });
    });

    it("should clear entries across systems", () => {
      ["1", "2", "3"].forEach((id, i) =>
        systemA.users.set(id, User.create({ name: id, cash: i + 1 })),
      );

      flushState(systemA);
      ["1", "2", "3"].forEach((id, i) =>
        systemB.users.set(id, User.create({ name: id, cash: i + 1 })),
      );

      systemA.users.clear();
      const patch = flushState(systemA);
      updateState(systemB, patch);

      expect(systemB.users.size).toBe(0);
    });

    it("should produce smaller patch when flushing incremental additions", () => {
      systemA.users.set("1", User.create({ name: "1", cash: 1 }));
      systemA.users.set("2", User.create({ name: "2", cash: 2 }));
      const patch1 = flushState(systemA);

      systemA.users.set("3", User.create({ name: "3", cash: 3 }));
      const patch2 = flushState(systemA);

      expect(sizeOf(patch2)).toBeLessThan(sizeOf(patch1));
    });

    it("should yield empty patch when flushing twice without changes", () => {
      systemA.users.set("1", User.create({ name: "1", cash: 1 }));
      flushState(systemA);
      const patch = flushState(systemA);
      expect(patch).toHaveLength(0);
    });
  });

  describe("Component change propagation", () => {
    function newUser() {
      return User.create({ name: "John", cash: 100 });
    }

    it("should apply changes made before adding to map", () => {
      const inst = newUser();
      inst.name = "Jane";
      inst.cash = 200;

      systemA.users.set("1", inst);
      const patch = flushState(systemA);

      systemB.users.set("1", newUser());
      updateState(systemB, patch);

      expect(systemB.users.get("1")).toMatchObject({
        name: "Jane",
        cash: 200,
      });
    });

    it("should apply changes made after adding to map", () => {
      const inst = newUser();
      systemA.users.set("1", inst);

      inst.name = "Jane";
      inst.cash = 200;
      const patch = flushState(systemA);

      systemB.users.set("1", newUser());
      updateState(systemB, patch);

      expect(systemB.users.get("1")).toMatchObject({
        name: "Jane",
        cash: 200,
      });
    });

    it("should produce smaller patch when changing fewer fields", () => {
      const inst = newUser();
      systemA.users.set("1", inst);

      inst.name = "Jane";
      const patch1 = flushState(systemA);

      inst.cash = 200;
      inst.name = "Foobar";
      const patch2 = flushState(systemA);

      expect(sizeOf(patch1)).toBeLessThan(sizeOf(patch2));
    });

    it("should yield empty patch when flushing twice after changes", () => {
      const inst = newUser();
      inst.name = "Jane";
      inst.cash = 200;

      systemA.users.set("1", inst);
      flushState(systemA);
      const patch = flushState(systemA);

      expect(patch).toHaveLength(0);
    });
  });
});

describe("Deeply nested", () => {
  const Movement = object({
    x: prop<number>(),
    y: prop<number>(),
    speed: prop<number>(),
  });
  const User = object({
    name: prop<string>(),
    cash: prop<number>(),
    movement: Movement,
  });
  type User = typeof User.$infer;
  function makeState() {
    return { users: new SyncMap<string, User>() };
  }

  let systemA: ReturnType<typeof makeState>;
  let systemB: ReturnType<typeof makeState>;

  beforeEach(() => {
    systemA = makeState();
    systemB = makeState();
  });

  function newNestedUser() {
    return User.create({
      name: "John",
      cash: 100,
      movement: { x: 10, y: 20, speed: 30 },
    });
  }

  it("should flush and apply nested state changes", () => {
    const inst = newNestedUser();
    systemA.users.set("1", inst);
    let patch = flushState(systemA);
    updateState(systemB, patch);

    inst.movement.x = 20;
    inst.movement.y = 30;
    inst.movement.speed = 40;
    patch = flushState(systemA);

    systemB.users.set("1", newNestedUser());
    updateState(systemB, patch);

    expect(systemB.users.get("1")).toMatchObject({
      name: "John",
      cash: 100,
      movement: { x: 20, y: 30, speed: 40 },
    });
  });

  it("should yield empty patch when no new nested changes", () => {
    const inst = newNestedUser();
    systemA.users.set("1", inst);
    inst.movement.x = 20;
    inst.movement.y = 30;
    inst.movement.speed = 40;

    flushState(systemA);
    const patch = flushState(systemA);
    expect(patch).toHaveLength(0);
  });

  describe("Nested property replacement", () => {
    it("should retain tracked instance on assignment", () => {
      const inst = newNestedUser();
      const before = inst.movement;
      inst.movement = { x: 20, y: 30, speed: 40 };
      expect(inst.movement).toBe(before);
    });

    it("should record mutation as patch", () => {
      const inst = newNestedUser();
      systemA.users.set("1", inst);
      let patch = flushState(systemA);
      updateState(systemB, patch);

      inst.movement = { x: 20, y: 30, speed: 40 };
      patch = flushState(systemA);

      systemB.users.set("1", newNestedUser());
      updateState(systemB, patch);

      expect(systemB.users.get("1")).toMatchObject({
        name: "John",
        cash: 100,
        movement: { x: 20, y: 30, speed: 40 },
      });
    });
  });
});

describe("Encoding & reactivity", () => {
  it("should encode and decode entity preserving flushability", () => {
    const Thing = object({ value: prop<number>() });
    type Thing = typeof Thing.$infer;

    const enc = createEncoding<Thing>(99);

    const before = Thing.create({ value: 10 });
    const after = enc.decode(enc.encode(before))._unsafeUnwrap();
    expect(after.value).toBe(10);

    after.value = 20;
    const patch = flushTrackedInstance(after);
    expect(patch).toBeDefined();
  });

  it("decoder does not interpret class instances as pojos", () => {
    class NumberHolder {
      constructor(public value: number) {}
    }

    addEncoderExtension<NumberHolder, number>({
      Class: NumberHolder,
      tag: 99,
      encode: (instance, encode) => encode(instance.value),
      decode: (value) => new NumberHolder(value),
    });

    const Obj = object({ holder: prop<NumberHolder>() });
    type Obj = typeof Obj.$infer;

    const enc = createEncoding<Obj>(100);

    const before = Obj.create({ holder: new NumberHolder(10) });
    const after = enc.decode(enc.encode(before))._unsafeUnwrap();
    expect(after.holder).toBeInstanceOf(NumberHolder);

    expect(after.holder.value).toBe(10);
  });

  it("should react to property changes", () => {
    const Counter = object({ count: prop<number>() });
    const c = Counter.create({ count: 0 });

    const spyFn = vi.fn();
    effect(() => {
      spyFn(c.count);
    });

    c.count++;
    expect(spyFn).toHaveBeenNthCalledWith(1, 0);
    expect(spyFn).toHaveBeenNthCalledWith(2, 1);
    expect(c.count).toBe(1);
  });
});

describe("Property tracking optimization", () => {
  const Entity = object({
    value: prop<number>({
      transform: (v) => parseFloat(v.toFixed(3)),
      filter: (a, b) => Math.floor(a) !== Math.floor(b),
    }),
  });

  it("should transform values on flush", () => {
    const e = Entity.create({ value: 10.123456789 });
    const changes = flushTrackedInstance(e)!;

    const e2 = Entity.create({ value: 0 });
    updateTrackedInstance(e2, changes);
    expect(e2.value).toBe(10.123);
  });

  it("should filter insignificant changes", () => {
    const e = Entity.create({ value: 10 });
    flushTrackedInstance(e);

    e.value = 10.5;
    expect(e.value).toBe(10.5);
    const flush1 = flushTrackedInstance(e);
    expect(flush1).toBeUndefined();

    e.value = 11;
    const flush2 = flushTrackedInstance(e);
    expect(flush2).toBeDefined();

    const e3 = Entity.create({ value: 0 });
    updateTrackedInstance(e3, flush2!);
    expect(e3.value).toBe(11);
  });
});
