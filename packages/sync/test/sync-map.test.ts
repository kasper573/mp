import { describe, expect, it, vi } from "vitest";
import { effect } from "@mp/state";
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

describe("effects", () => {
  describe("can react to", () => {
    it("Map.clear", () => {
      testEffect({
        initialize: () => new SyncMap<string, string>([["1", "a"]]),
        mutate: (map) => map.clear(),
        getKey: "1",
        getResultExpectation: undefined,
        sizeExpectation: 0,
      });
    });

    it("Map.delete", () => {
      testEffect({
        initialize: () =>
          new SyncMap<string, string>([
            ["1", "a"],
            ["2", "b"],
          ]),
        mutate: (map) => map.delete("1"),
        getKey: "1",
        getResultExpectation: undefined,
        sizeExpectation: 1,
      });
    });

    it("Map.set (overwrite existing)", () => {
      testEffect({
        initialize: () => new SyncMap<string, string>([["1", "a"]]),
        mutate: (map) => map.set("1", "b"),
        getKey: "1",
        getResultExpectation: "b",
        sizeExpectation: 1,
      });
    });

    it("Map.set (new key)", () => {
      testEffect({
        initialize: () => new SyncMap<string, string>([["1", "a"]]),
        mutate: (map) => map.set("2", "b"),
        getKey: "2",
        getResultExpectation: "b",
        sizeExpectation: 2,
      });
    });
  });

  it("can unsubscribe", () => {
    class Entity {
      constructor(public name: string) {}
    }

    const map = new SyncMap<string, Entity>();

    let calls = 0;
    const fn = (_: unknown) => calls++;
    const stop = effect(() => void fn(map.get("1")));

    const callsBeforeStop = calls;
    stop();

    map.set("1", new Entity("jane"));
    expect(calls).toBe(callsBeforeStop);
  });

  it("does not notify when entities are mutated", () => {
    class Entity extends SyncEntity {
      @collect()
      accessor name: string;
      constructor(name: string) {
        super();
        this.name = name;
      }
    }

    const person = new Entity("john");
    const map = new SyncMap<string, Entity>([["1", person]]);

    const fn = vi.fn();
    effect(() => void fn(map.get("1")));
    person.name = "jane";

    expect(fn).toHaveBeenCalledTimes(1); // only the init call
  });
});

describe("index", () => {
  it("can index by a single property", () => {
    class Entity extends SyncEntity {
      constructor(public type: string) {
        super();
      }
    }

    const map = new SyncMap<string, Entity>([
      ["apple", new Entity("fruit")],
      ["banana", new Entity("fruit")],
      ["carrot", new Entity("vegetable")],
      ["broccoli", new Entity("vegetable")],
    ]);

    const entityIds = map.index({ type: "fruit" }).keys().toArray();
    expect(entityIds).toEqual(["apple", "banana"]);
  });

  it("can index by two properties", () => {
    class Entity extends SyncEntity {
      constructor(
        public type: string,
        public color: string,
      ) {
        super();
      }
    }

    const map = new SyncMap<string, Entity>([
      ["apple", new Entity("fruit", "red")],
      ["banana", new Entity("fruit", "yellow")],
      ["carrot", new Entity("vegetable", "orange")],
      ["broccoli", new Entity("vegetable", "green")],
    ]);

    const entityIds = map
      .index({ type: "fruit", color: "yellow" })
      .keys()
      .toArray();
    expect(entityIds).toEqual(["banana"]);
  });

  it("can index by three properties", () => {
    class Entity extends SyncEntity {
      constructor(
        public type: string,
        public color: string,
        public size: string,
      ) {
        super();
      }
    }

    const map = new SyncMap<string, Entity>([
      ["apple", new Entity("fruit", "red", "small")],
      ["banana", new Entity("fruit", "yellow", "medium")],
      ["carrot", new Entity("vegetable", "orange", "large")],
      ["broccoli", new Entity("vegetable", "green", "medium")],
    ]);

    const entityIds = map
      .index({ type: "fruit", color: "yellow", size: "medium" })
      .keys()
      .toArray();
    expect(entityIds).toEqual(["banana"]);
  });

  it("index is correctly updated on changes", () => {
    class Entity extends SyncEntity {
      constructor(public type: string) {
        super();
      }
    }

    const map = new SyncMap<string, Entity>([
      ["apple", new Entity("fruit")],
      ["banana", new Entity("fruit")],
    ]);

    const fruitIds = map.index({ type: "fruit" }).keys().toArray();
    expect(fruitIds).toEqual(["apple", "banana"]);

    map.get("banana")!.type = "vegetable";
    const updatedFruitIds = map.index({ type: "fruit" }).keys().toArray();
    expect(updatedFruitIds).toEqual(["apple"]);
  });

  it("can suspend index updates", () => {
    class Entity extends SyncEntity {
      constructor(public type: string) {
        super();
      }
    }

    const map = new SyncMap<string, Entity>([
      ["apple", new Entity("fruit")],
      ["banana", new Entity("fruit")],
    ]);

    const fruitIds = () => map.index({ type: "fruit" }).keys().toArray();
    expect(fruitIds()).toEqual(["apple", "banana"]);

    const resume = map.suspendIndexUpdates();
    map.get("banana")!.type = "vegetable";

    expect(fruitIds()).toEqual(["apple", "banana"]);

    resume();

    expect(fruitIds()).toEqual(["apple"]);
  });

  it("when index updates are suspended, reads of entirely new indexes should still be resolved, but only once", () => {
    class Entity extends SyncEntity {
      constructor(public type: string) {
        super();
      }
    }

    const map = new SyncMap<string, Entity>([
      ["apple", new Entity("fruit")],
      ["banana", new Entity("fruit")],
    ]);

    const resume = map.suspendIndexUpdates();

    const vegetableIds = () => map.index({ type: "fruit" }).keys().toArray();
    expect(vegetableIds()).toEqual(["apple", "banana"]);

    map.get("banana")!.type = "vegetable";

    // Still returns the old index, since updates are suspended
    expect(vegetableIds()).toEqual(["apple", "banana"]);

    resume();

    // Now it returns the updated index
    expect(vegetableIds()).toEqual(["apple"]);
  });
});

function testEffect<K, V>(opt: {
  initialize: () => SyncMap<K, V>;
  mutate: (map: SyncMap<K, V>) => void;
  getKey: K;
  getResultExpectation: V | undefined;
  sizeExpectation: number;
}) {
  const map = opt.initialize();

  const sizeFn = vi.fn();
  effect(() => void sizeFn(map.size));

  const valuesFn = vi.fn();
  effect(() => void valuesFn(map.values()));

  const entriesFn = vi.fn();
  effect(() => void entriesFn(map.entries()));

  const keysFn = vi.fn();
  effect(() => void keysFn(map.keys()));

  const hasFn = vi.fn();
  effect(() => void hasFn(map.has(opt.getKey)));

  const getFn = vi.fn();
  effect(() => void getFn(map.get(opt.getKey)));

  opt.mutate(map);

  // 2 = initial call + change

  expect(sizeFn).toHaveBeenCalledTimes(2);
  expect(sizeFn).toHaveBeenLastCalledWith(opt.sizeExpectation);
  expect(getFn).toHaveBeenCalledTimes(2);
  expect(getFn).toHaveBeenLastCalledWith(opt.getResultExpectation);
  expect(hasFn).toHaveBeenCalledTimes(2);
  expect(hasFn).toHaveBeenLastCalledWith(
    opt.getResultExpectation !== undefined,
  );
  expect(valuesFn).toHaveBeenCalledTimes(2);
  expect(entriesFn).toHaveBeenCalledTimes(2);
  expect(keysFn).toHaveBeenCalledTimes(2);
}
