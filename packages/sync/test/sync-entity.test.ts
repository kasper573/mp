import { describe, expect, it, vi } from "vitest";
import { collect, SyncEntity } from "../src/sync-entity";
import { PatchType } from "../src/patch";

it("can collect changes as patch", () => {
  class Entity extends SyncEntity {
    @collect()
    accessor count: number = 0;
  }

  const e = new Entity();
  e.count = 1;
  e.count = 2;

  const patch = e.flush();
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
  const patch = e.flush();
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
  const subset = e.snapshot();
  expect(subset).toEqual({ count: 1, name: "john" });
});

describe("atom", () => {
  it("does not emit events on mutation", () => {
    class Entity extends SyncEntity {
      @collect()
      accessor count: number = 0;
    }

    const fn = vi.fn();
    const e = new Entity();
    e.subscribe(fn);
    e.count = 1;
    e.count = 2;
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it("can listen to changes on class instances", () => {
    class Entity extends SyncEntity {
      @collect()
      accessor count: number = 0;
    }

    let receivedCount: number;
    const fn = vi.fn((arg) => {
      receivedCount = (arg as Entity).count;
    });
    const e = new Entity();
    e.count = 1;
    e.count = 2;

    e.subscribe(fn);
    e.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(receivedCount!).toEqual(2);
  });

  it("can stop listening to changes on class instances", () => {
    class Entity extends SyncEntity {
      @collect()
      accessor count: number = 0;
    }

    let receivedCount: number;
    const fn = vi.fn((arg) => {
      receivedCount = (arg as Entity).count;
    });
    const e = new Entity();

    const stop = e.subscribe(fn);

    e.count = 1;
    e.flush();

    stop();

    e.count = 2;
    e.flush();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(receivedCount!).toEqual(1);
  });
});
