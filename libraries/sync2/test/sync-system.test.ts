import { beforeEach, describe, expect, it } from "vitest";
import type { SyncSchemaFor } from "../src";
import { SyncSystem } from "../src";

describe("can flush and patch", () => {
  // oxlint-disable-next-line consistent-type-definitions
  type State = {
    users: {
      name: string;
      cash: number;
    };
  };

  const schema: SyncSchemaFor<State> = {
    users: {
      name: null,
      cash: null,
    },
  };

  let systemA: SyncSystem<State>;
  let systemB: SyncSystem<State>;
  let user: typeof systemA.entities.users.create;

  beforeEach(() => {
    systemA = new SyncSystem(schema);
    systemB = new SyncSystem(schema);
    user = systemA.entities.users.create;
  });

  it("can create entity instances", () => {
    const instance = user({ name: "John", cash: 100 });
    expect(instance).toEqual({
      name: "John",
      cash: 100,
    });
  });

  describe("map", () => {
    it("set", () => {
      // Assert that map set work in local system
      systemA.entities.users.set("1", user({ name: "1", cash: 1 }));
      expect(systemA.entities.users.get("1")).toEqual({ name: "1", cash: 1 });

      // Assert that flush and update works across systems
      const patch = systemA.flush();
      systemB.entities.users.set("2", user({ name: "2", cash: 2 }));
      systemB.update(patch);
      expect(systemB.entities.users.size).toBe(2);
      expect(systemB.entities.users.get("1")).toEqual({ name: "1", cash: 1 });
      expect(systemB.entities.users.get("2")).toEqual({ name: "2", cash: 2 });
    });

    it("delete", () => {
      systemA.entities.users.set("1", user({ name: "1", cash: 1 }));
      systemA.entities.users.set("2", user({ name: "2", cash: 2 }));
      systemA.entities.users.set("3", user({ name: "3", cash: 3 }));

      // Omit patch and manually update systemB to align with systemA before the deletes
      systemA.flush();
      systemB.entities.users.set("1", user({ name: "1", cash: 1 }));
      systemB.entities.users.set("2", user({ name: "2", cash: 2 }));
      systemB.entities.users.set("3", user({ name: "3", cash: 3 }));

      // Now delete the entity and flush to send a delete patch
      systemA.entities.users.delete("2");
      const patch = systemA.flush();
      systemB.update(patch);

      expect(systemB.entities.users.get("1")).toEqual({ name: "1", cash: 1 });
      expect(systemB.entities.users.get("2")).toBeUndefined();
      expect(systemB.entities.users.get("3")).toEqual({ name: "3", cash: 3 });
    });

    it("clear", () => {
      systemA.entities.users.set("1", user({ name: "1", cash: 1 }));
      systemA.entities.users.set("2", user({ name: "2", cash: 2 }));
      systemA.entities.users.set("3", user({ name: "3", cash: 3 }));

      // Omit patch and manually update systemB to align with systemA before the clear
      systemA.flush();
      systemB.entities.users.set("1", user({ name: "1", cash: 1 }));
      systemB.entities.users.set("2", user({ name: "2", cash: 2 }));
      systemB.entities.users.set("3", user({ name: "3", cash: 3 }));

      // Now clear the map and flush to send a clear patch
      systemA.entities.users.clear();
      const patch = systemA.flush();
      systemB.update(patch);
      expect(systemB.entities.users.size).toBe(0);
    });

    it("flushing one entity produces a smaller patch than flushing two entities", () => {
      systemA.entities.users.set("1", user({ name: "1", cash: 1 }));
      systemA.entities.users.set("2", user({ name: "2", cash: 2 }));

      const patch1 = systemA.flush();

      systemA.entities.users.set("3", user({ name: "3", cash: 3 }));
      const patch2 = systemA.flush();

      expect(sizeOf(patch2)).toBeLessThan(sizeOf(patch1));
    });

    it("double flush always yields empty patch", () => {
      systemA.entities.users.set("1", user({ name: "1", cash: 1 }));
      systemA.flush();
      const patch = systemA.flush();
      expect(patch).toHaveLength(0);
    });
  });

  describe("component", () => {
    it("changes before adding to map", () => {
      const instance = user({ name: "John", cash: 100 });
      instance.name = "Jane";
      instance.cash = 200;

      systemA.entities.users.set("1", instance);
      const patch = systemA.flush();
      systemB.update(patch);
      expect(systemB.entities.users.get("1")).toEqual({
        name: "Jane",
        cash: 200,
      });
    });

    it("changes after adding to map", () => {
      const instance = user({ name: "John", cash: 100 });
      systemA.entities.users.set("1", instance);
      instance.name = "Jane";
      instance.cash = 200;

      const patch = systemA.flush();
      systemB.update(patch);
      expect(systemB.entities.users.get("1")).toEqual({
        name: "Jane",
        cash: 200,
      });
    });

    it("changing one component produces a smaller flush than changing two components", () => {
      const instance = user({ name: "John", cash: 100 });
      systemA.entities.users.set("1", instance);
      instance.name = "Jane";
      const patch1 = systemA.flush();

      instance.cash = 200;
      instance.name = "Foobar";
      const patch2 = systemA.flush();

      expect(sizeOf(patch1)).toBeLessThan(sizeOf(patch2));
    });

    it("double flush always yields empty patch", () => {
      const instance = user({ name: "John", cash: 100 });
      instance.name = "Jane";
      instance.cash = 200;

      systemA.entities.users.set("1", instance);
      systemA.flush();
      const patch = systemA.flush();

      expect(patch).toHaveLength(0);
    });
  });
});

describe("deeply nested state", () => {
  interface Movement {
    x: number;
    y: number;
    speed: number;
  }

  // oxlint-disable-next-line consistent-type-definitions
  type State = {
    users: {
      name: string;
      cash: number;
      movement: Movement;
    };
  };

  const schema: SyncSchemaFor<State> = {
    users: {
      name: null,
      cash: null,
      movement: {
        x: null,
        y: null,
        speed: null,
      },
    },
  };

  let systemA: SyncSystem<State>;
  let systemB: SyncSystem<State>;
  let user: typeof systemA.entities.users.create;

  beforeEach(() => {
    systemA = new SyncSystem(schema);
    systemB = new SyncSystem(schema);
    user = systemA.entities.users.create;
  });

  it("can flush and patch", () => {
    const instance = user({
      name: "John",
      cash: 100,
      movement: { x: 10, y: 20, speed: 30 },
    });
    systemA.entities.users.set("1", instance);

    let patch = systemA.flush();
    systemB.update(patch);

    instance.movement.x = 20;
    instance.movement.y = 30;
    instance.movement.speed = 40;
    patch = systemA.flush();
    systemB.update(patch);

    expect(systemB.entities.users.get("1")).toEqual({
      name: "John",
      cash: 100,
      movement: { x: 20, y: 30, speed: 40 },
    });
  });

  it("double flush always yields empty patch", () => {
    const instance = user({
      name: "John",
      cash: 100,
      movement: { x: 10, y: 20, speed: 30 },
    });
    systemA.entities.users.set("1", instance);
    instance.movement.x = 20;
    instance.movement.y = 30;
    instance.movement.speed = 40;

    systemA.flush();
    const patch = systemA.flush();

    expect(patch).toHaveLength(0);
  });
});

function sizeOf(arg: unknown): number {
  return JSON.stringify(arg).length;
}
