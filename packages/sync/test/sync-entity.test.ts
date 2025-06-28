import { describe, expect, it, vi } from "vitest";
import {
  collect,
  flushObject,
  selectCollectableSubset,
  subscribeToObject,
  SyncEntity,
} from "../src/sync-entity";
import { PatchType } from "../src/patch";

it("can collect changes as patch", () => {
  class Entity extends SyncEntity {
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
  class Entity extends SyncEntity {
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
  class Entity extends SyncEntity {
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
    class Entity extends SyncEntity {
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
    class Entity extends SyncEntity {
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
    class Entity extends SyncEntity {
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
});
