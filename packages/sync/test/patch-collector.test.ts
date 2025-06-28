import { describe, expect, it, vi } from "vitest";
import {
  collect,
  flushObject,
  flushRecord,
  selectCollectableSubset,
  subscribeToObject,
  subscribeToRecord,
} from "../src/patch-collector";
import { applyPatch, PatchType } from "../src/patch";

it("can collect changes as patch", () => {
  class Entity {
    @collect()
    accessor count: number = 0;
  }

  const e = new Entity();
  e.count = 1;
  e.count = 2;

  const patch = flushObject(e);
  expect(patch).toEqual([[PatchType.Update, [], { count: 2 }]]);
});

it("does not collect changes to non decorated fields", () => {
  class Entity {
    @collect()
    accessor count: number = 0;

    notCollected = "value";
  }

  const e = new Entity();
  e.notCollected = "changed";
  const patch = flushObject(e);
  expect(patch).toEqual([]);
});

it("can select collectable subset", () => {
  class Entity {
    @collect()
    accessor count: number = 0;

    @collect()
    accessor name: string = "";

    notCollected = "value";
  }

  const e = new Entity();
  e.count = 1;
  e.name = "john";
  const subset = selectCollectableSubset(e);
  expect(subset).toEqual({ count: 1, name: "john" });
});

describe("subscriptions", () => {
  it("does not emit events on mutation", () => {
    class Entity {
      @collect()
      accessor count: number = 0;
    }

    const fn = vi.fn();
    const e = new Entity();
    subscribeToObject(e, fn);
    e.count = 1;
    e.count = 2;
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("can subscribe to changes on class instances", () => {
    class Entity {
      @collect()
      accessor count: number = 0;
    }

    const fn = vi.fn();
    const e = new Entity();
    e.count = 1;
    e.count = 2;

    subscribeToObject(e, fn);
    flushObject(e);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenNthCalledWith(1, { count: 2 });
  });

  it("can stop subscribing to changes on class instances", () => {
    class Entity {
      @collect()
      accessor count: number = 0;
    }

    const fn = vi.fn();
    const e = new Entity();

    const stop = subscribeToObject(e, fn);

    e.count = 1;
    flushObject(e);

    stop();

    e.count = 2;
    flushObject(e);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenNthCalledWith(1, { count: 1 });
  });

  it("can subscribe to changes on records", () => {
    class Entity {
      constructor(public name: string) {}
    }

    const record: Record<string, Entity> = {};

    const fn = vi.fn();
    subscribeToRecord(record, fn);

    // Adding
    const john = new Entity("john");
    record["1"] = john;
    flushRecord(record);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenNthCalledWith(1, {
      type: "add",
      key: "1",
      value: john,
    });

    // Removing
    delete record["1"];
    flushRecord(record);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(2, {
      type: "remove",
      key: "1",
    });
  });

  it("can stop subscribing to changes on records", () => {
    class Entity {
      constructor(public name: string) {}
    }

    const record: Record<string, Entity> = {};

    const fn = vi.fn();
    const stop = subscribeToRecord(record, fn);

    record["1"] = new Entity("john");
    flushRecord(record);
    expect(fn).toHaveBeenCalledTimes(1);

    stop();

    record["1"] = new Entity("jane");
    flushRecord(record);
    expect(fn).toHaveBeenCalledTimes(1); // unchanged
  });
});

describe("can collect changes from record of decorated entities", () => {
  it("set", () => {
    class Entity {
      @collect()
      accessor cash: number = 0;
    }

    const source: Record<string, Entity> = {};
    source["john"] = new Entity();
    source["john"].cash = 50;

    const patch = flushRecord(source);

    const receiver: Record<string, Entity> = {};
    applyPatch(receiver, patch);

    expect(receiver.john.cash).toBe(50);
  });

  it("delete", () => {
    class Entity {
      @collect()
      accessor cash: number = 0;
    }

    const john = new Entity();
    john.cash = 0;
    const jane = new Entity();
    jane.cash = 50;

    const source: Record<string, Entity> = { john, jane };

    // Flush initial state
    const receiver: Record<string, Entity> = Object.fromEntries([]);
    applyPatch(receiver, flushRecord(source));

    // Apply and flush delete
    delete source["john"];
    applyPatch(receiver, flushRecord(source));

    expect(receiver.john).toBeUndefined();
    expect(receiver.jane.cash).toBe(50);
  });

  it("entity mutation", () => {
    class Entity {
      @collect()
      accessor cash: number = 0;
    }

    const john = new Entity();
    john.cash = 0;
    const source = { john };

    // Flush initial state
    const receiver: Record<string, Entity> = {};
    const patch = flushRecord(source);
    applyPatch(receiver, patch);

    // Apply and flush entity mutation
    john.cash = 25;
    applyPatch(receiver, patch);

    expect(receiver.john.cash).toBe(25);
  });
});
