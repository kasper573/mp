import { int16, object, string } from "@mp/encoding/schema";
import { beforeEach, describe, expect, it } from "vitest";
import type { SyncSchema } from "../src";
import { SyncSystem } from "../src";

describe("can flush and patch", () => {
  // oxlint-disable-next-line consistent-type-definitions
  type State = {
    users: {
      name: string;
      cash: number;
    };
  };

  const schemas: SyncSchema<State> = {
    users: object(1, {
      name: string(),
      cash: int16(),
    }),
  };

  let systemA: SyncSystem<State>;
  let systemB: SyncSystem<State>;
  let user: typeof systemA.controls.users.create;

  beforeEach(() => {
    systemA = new SyncSystem(schemas);
    systemB = new SyncSystem(schemas);
    user = systemA.controls.users.create;
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
      systemA.controls.users.set("1", user({ name: "1", cash: 1 }));
      expect(systemA.controls.users.get("1")).toEqual({ name: "1", cash: 1 });

      // Assert that flush and update works across systems
      const patch = systemA.flush();
      systemB.controls.users.set("2", user({ name: "2", cash: 2 }));
      systemB.update(patch);
      expect(systemB.controls.users.get("1")).toEqual({ name: "1", cash: 1 });
    });

    it("delete", () => {
      systemA.controls.users.set("1", user({ name: "1", cash: 1 }));
      systemA.controls.users.set("2", user({ name: "2", cash: 2 }));
      systemA.controls.users.set("3", user({ name: "3", cash: 3 }));

      // Omit patch and manually update systemB to align with systemA before the deletes
      systemA.flush();
      systemB.controls.users.set("1", user({ name: "1", cash: 1 }));
      systemB.controls.users.set("2", user({ name: "2", cash: 2 }));
      systemB.controls.users.set("3", user({ name: "3", cash: 3 }));

      // Now delete the entity and flush to send a delete patch
      systemA.controls.users.delete("2");
      const patch = systemA.flush();
      systemB.update(patch);

      expect(systemB.controls.users.get("1")).toEqual({ name: "1", cash: 1 });
      expect(systemB.controls.users.get("2")).toBeUndefined();
      expect(systemB.controls.users.get("3")).toEqual({ name: "3", cash: 3 });
    });

    it("clear", () => {
      systemA.controls.users.set("1", user({ name: "1", cash: 1 }));
      systemA.controls.users.set("2", user({ name: "2", cash: 2 }));
      systemA.controls.users.set("3", user({ name: "3", cash: 3 }));

      // Omit patch and manually update systemB to align with systemA before the clear
      systemA.flush();
      systemB.controls.users.set("1", user({ name: "1", cash: 1 }));
      systemB.controls.users.set("2", user({ name: "2", cash: 2 }));
      systemB.controls.users.set("3", user({ name: "3", cash: 3 }));

      // Now clear the map and flush to send a clear patch
      systemA.controls.users.clear();
      const patch = systemA.flush();
      systemB.update(patch);
      expect(systemB.controls.users.size).toBe(0);
    });

    it("flushing one entity produces a smaller patch than flushing two entities", () => {
      systemA.controls.users.set("1", user({ name: "1", cash: 1 }));
      systemA.controls.users.set("2", user({ name: "2", cash: 2 }));

      const patch1 = systemA.flush();

      systemA.controls.users.set("3", user({ name: "3", cash: 3 }));
      const patch2 = systemA.flush();

      expect(patch1.byteLength).toBeLessThan(patch2.byteLength);
    });
  });

  describe("component", () => {
    it("changes before adding to map", () => {
      const instance = user({ name: "John", cash: 100 });
      instance.name = "Jane";
      instance.cash = 200;

      systemA.controls.users.set("1", instance);
      const patch = systemA.flush();
      systemB.update(patch);
      expect(systemB.controls.users.get("1")).toEqual({
        name: "Jane",
        cash: 200,
      });
    });

    it("changes after adding to map", () => {
      const instance = user({ name: "John", cash: 100 });
      systemA.controls.users.set("1", instance);
      instance.name = "Jane";
      instance.cash = 200;

      const patch = systemA.flush();
      systemB.update(patch);
      expect(systemB.controls.users.get("1")).toEqual({
        name: "Jane",
        cash: 200,
      });
    });

    it("changing one component produces a smaller flush than changing two components", () => {
      const instance = user({ name: "John", cash: 100 });
      systemA.controls.users.set("1", instance);
      instance.name = "Jane";
      const patch1 = systemA.flush();

      instance.cash = 200;
      instance.name = "Foobar";
      const patch2 = systemA.flush();

      expect(patch1.byteLength).toBeLessThan(patch2.byteLength);
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

  const schemas: SyncSchema<State> = {
    users: object(1, {
      name: string(),
      cash: int16(),
      movement: object(2, {
        x: int16(),
        y: int16(),
        speed: int16(),
      }),
    }),
  };

  let systemA: SyncSystem<State>;
  let systemB: SyncSystem<State>;
  let user: typeof systemA.controls.users.create;

  beforeEach(() => {
    systemA = new SyncSystem(schemas);
    systemB = new SyncSystem(schemas);
    user = systemA.controls.users.create;
  });

  it("can flush and patch", () => {
    const instance = user({
      name: "John",
      cash: 100,
      movement: { x: 10, y: 20, speed: 30 },
    });
    systemA.controls.users.set("1", instance);

    systemB.update(systemA.flush());

    if (!instance.movement) {
      throw new Error("Expected movement to be defined");
    }

    instance.movement.x = 20;
    instance.movement.y = 30;
    instance.movement.speed = 40;
    systemB.update(systemA.flush());

    expect(systemB.controls.users.get("1")).toEqual({
      name: "John",
      cash: 100,
      movement: { x: 20, y: 30, speed: 40 },
    });
  });
});
