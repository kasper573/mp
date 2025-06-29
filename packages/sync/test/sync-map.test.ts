import { describe, expect, it, vi } from "vitest";
import { collect, SyncEntity } from "../src/sync-entity";
import { SyncMap } from "../src/sync-map";
import { applyPatch } from "../src/patch";

describe("can collect changes from map of decorated entities", () => {
  it("set", () => {
    class Entity extends SyncEntity {
      @collect()
      accessor cash: number = 0;
    }

    const map = new SyncMap<string, Entity>();
    map.set("john", new Entity());
    map.get("john")!.cash = 50;

    const patch = map.flush();

    const receiver: Record<string, Entity> = {};
    applyPatch(receiver, patch);

    expect(receiver.john.cash).toBe(50);
  });

  it("delete", () => {
    class Entity extends SyncEntity {
      @collect()
      accessor cash: number = 0;
    }

    const john = new Entity();
    john.cash = 0;
    const jane = new Entity();
    jane.cash = 50;

    const map = new SyncMap<string, Entity>([
      ["john", john],
      ["jane", jane],
    ]);

    // Flush initial state
    const receiver: Record<string, Entity> = {};
    applyPatch(receiver, map.flush());

    // Apply and flush delete
    map.delete("john");
    applyPatch(receiver, map.flush());

    expect(receiver.john).toBeUndefined();
    expect(receiver.jane.cash).toBe(50);
  });

  it("entity mutation", () => {
    class Entity extends SyncEntity {
      @collect()
      accessor cash: number = 0;
    }

    const john = new Entity();
    john.cash = 0;
    const map = new SyncMap([["john", john]]);

    // Flush initial state
    const receiver: Record<string, Entity> = {};
    const patch = map.flush();
    applyPatch(receiver, patch);

    // Apply and flush entity mutation
    john.cash = 25;
    applyPatch(receiver, patch);

    expect(receiver.john.cash).toBe(25);
  });
});

describe("subscriptions", () => {
  describe("can subscribe to", () => {
    it("additions", () => {
      class Entity extends SyncEntity {
        constructor(public name: string) {
          super();
        }
      }

      const map = new SyncMap<string, Entity>();

      const fn = vi.fn();
      map.subscribe(fn);

      const john = new Entity("john");
      map.set("1", john);
      map.flush();
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenNthCalledWith(1, {
        type: "add",
        key: "1",
        value: john,
      });
    });

    it("updates", () => {
      class Entity extends SyncEntity {
        constructor(public name: string) {
          super();
        }
      }

      const john = new Entity("john");
      const map = new SyncMap<string, Entity>([["1", john]]);

      map.flush(); // Discard initial state

      const fn = vi.fn();
      map.subscribe(fn);

      const jane = new Entity("jane");
      map.set("1", jane);
      map.flush();
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenNthCalledWith(1, {
        type: "update",
        key: "1",
        value: jane,
      });
    });

    it("removals", () => {
      class Entity extends SyncEntity {
        constructor(public name: string) {
          super();
        }
      }

      const john = new Entity("john");
      const map = new SyncMap<string, Entity>([["1", john]]);

      map.flush(); // Discard initial state

      const fn = vi.fn();
      map.subscribe(fn);

      map.delete("1");
      map.flush();
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenNthCalledWith(1, {
        type: "remove",
        key: "1",
      });
    });
  });

  it("can unsubscribe", () => {
    class Entity {
      constructor(public name: string) {}
    }

    const map = new SyncMap<string, Entity>();

    const fn = vi.fn();
    const stop = map.subscribe(fn);

    map.set("1", new Entity("john"));
    map.flush();
    expect(fn).toHaveBeenCalledTimes(1);

    stop();

    map.set("1", new Entity("jane"));
    map.flush();
    expect(fn).toHaveBeenCalledTimes(1); // unchanged
  });
});
