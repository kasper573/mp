import { describe, expect, it, vi } from "vitest";
import { effect } from "@mp/state";
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

describe("effects", () => {
  it("can listen to changes on class instances", () => {
    class Entity extends SyncEntity {
      @collect()
      accessor value: string = "initial";
    }

    let received: unknown;
    const fn = vi.fn((arg) => {
      received = arg;
    });
    const e = new Entity();
    effect(() => fn(e.value));
    e.value = "first";
    e.value = "second";
    expect(fn).toHaveBeenCalledTimes(3);
    expect(received).toEqual("second");
  });

  it("can stop listening to changes on class instances", () => {
    class Entity extends SyncEntity {
      @collect()
      accessor value: string = "initial";
    }

    let received: unknown;
    const fn = vi.fn((arg) => {
      received = arg;
    });
    const e = new Entity();

    const stop = effect(() => fn(e.value));

    e.value = "first";

    stop();

    e.value = "second";

    expect(fn).toHaveBeenCalledTimes(2); // one when effect inits, another when e.count = "first"
    expect(received).toEqual("first");
  });
});
