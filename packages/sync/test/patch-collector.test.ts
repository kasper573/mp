import { describe, expect, it } from "vitest";
import {
  collect,
  flushClassInstance,
  flushRecord,
  selectCollectableSubset,
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

  const patch = flushClassInstance(e);
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
  const patch = flushClassInstance(e);
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
