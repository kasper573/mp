import { effect } from "@mp/state";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { entity } from "../src/sync-entity";
import { SyncMap } from "../src/sync-map";
import { flushState, updateState } from "../src/sync-state";

describe("can flush and patch", () => {
  class State {
    users = new SyncMap<string, User>();
  }

  @entity
  class User {
    constructor(
      public name = "",
      public cash = 0,
    ) {}
  }

  function userFrom(data: User): User {
    const user = new User();
    user.name = data.name;
    user.cash = data.cash;
    return user;
  }

  let systemA: State;
  let systemB: State;

  beforeEach(() => {
    systemA = new State();
    systemB = new State();
  });

  it("can create entity instances", () => {
    const instance = new User("John", 100);
    expect(instance).toMatchObject({
      name: "John",
      cash: 100,
    });
  });

  describe("map", () => {
    it("set", () => {
      // Assert that map set work in local system
      systemA.users.set("1", userFrom({ name: "1", cash: 1 }));
      expect(systemA.users.get("1")).toMatchObject({ name: "1", cash: 1 });

      // Assert that flush and update works across systems
      const patch = flushState(systemA);
      systemB.users.set("2", userFrom({ name: "2", cash: 2 }));
      updateState(systemB, patch);
      expect(systemB.users.size).toBe(2);
      expect(systemB.users.get("1")).toMatchObject({ name: "1", cash: 1 });
      expect(systemB.users.get("2")).toMatchObject({ name: "2", cash: 2 });
    });

    it("delete", () => {
      systemA.users.set("1", userFrom({ name: "1", cash: 1 }));
      systemA.users.set("2", userFrom({ name: "2", cash: 2 }));
      systemA.users.set("3", userFrom({ name: "3", cash: 3 }));

      // Omit patch and manually update systemB to align with systemA before the deletes
      flushState(systemA);
      systemB.users.set("1", userFrom({ name: "1", cash: 1 }));
      systemB.users.set("2", userFrom({ name: "2", cash: 2 }));
      systemB.users.set("3", userFrom({ name: "3", cash: 3 }));

      // Now delete the entity and flush to send a delete patch
      systemA.users.delete("2");
      const patch = flushState(systemA);
      updateState(systemB, patch);

      expect(systemB.users.get("1")).toMatchObject({ name: "1", cash: 1 });
      expect(systemB.users.get("2")).toBeUndefined();
      expect(systemB.users.get("3")).toMatchObject({ name: "3", cash: 3 });
    });

    it("clear", () => {
      systemA.users.set("1", userFrom({ name: "1", cash: 1 }));
      systemA.users.set("2", userFrom({ name: "2", cash: 2 }));
      systemA.users.set("3", userFrom({ name: "3", cash: 3 }));

      // Omit patch and manually update systemB to align with systemA before the clear
      flushState(systemA);
      systemB.users.set("1", userFrom({ name: "1", cash: 1 }));
      systemB.users.set("2", userFrom({ name: "2", cash: 2 }));
      systemB.users.set("3", userFrom({ name: "3", cash: 3 }));

      // Now clear the map and flush to send a clear patch
      systemA.users.clear();
      const patch = flushState(systemA);
      updateState(systemB, patch);
      expect(systemB.users.size).toBe(0);
    });

    it("flushing one entity produces a smaller patch than flushing two entities", () => {
      systemA.users.set("1", userFrom({ name: "1", cash: 1 }));
      systemA.users.set("2", userFrom({ name: "2", cash: 2 }));

      const patch1 = flushState(systemA);

      systemA.users.set("3", userFrom({ name: "3", cash: 3 }));
      const patch2 = flushState(systemA);

      expect(sizeOf(patch2)).toBeLessThan(sizeOf(patch1));
    });

    it("double flush always yields empty patch", () => {
      systemA.users.set("1", userFrom({ name: "1", cash: 1 }));
      flushState(systemA);
      const patch = flushState(systemA);
      expect(patch).toHaveLength(0);
    });
  });

  describe("component", () => {
    function startInstance() {
      return userFrom({ name: "John", cash: 100 });
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
  @entity
  class Movement {
    x = 0;
    y = 0;
    speed = 0;
  }

  @entity
  class User {
    name = "";
    cash = 0;
    movement = new Movement();
  }

  function userFrom(data: User): User {
    const user = new User();
    user.name = data.name;
    user.cash = data.cash;
    user.movement.x = data.movement.x;
    user.movement.y = data.movement.y;
    user.movement.speed = data.movement.speed;
    return user;
  }

  class State {
    users = new SyncMap<string, User>();
  }

  let systemA: State;
  let systemB: State;

  beforeEach(() => {
    systemA = new State();
    systemB = new State();
  });

  function startInstance() {
    return userFrom({
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
});

function sizeOf(arg: unknown): number {
  return JSON.stringify(arg).length;
}

it("properties are reactive", () => {
  @entity
  class Counter {
    count = 0;
    label = "Counter";
    increment() {
      this.count++;
    }
    get double() {
      return this.count * 2;
    }
  }

  const c = new Counter();

  const spy = vi.fn();
  effect(() => {
    spy(c.count);
  });

  c.increment(); // Logs: Count is now: 1

  expect(spy).toHaveBeenNthCalledWith(1, 0);
  expect(spy).toHaveBeenNthCalledWith(2, 1);

  expect(c.double).toBe(2);
});
