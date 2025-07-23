import { describe, expect, it, vi } from "vitest";
import { effect } from "@mp/state";
import { SyncEntity } from "../src/sync-entity";
import { PatchType } from "../src/patch";
import { createSyncComponent } from "../src/sync-component";

it("can collect changes as patch", () => {
  class Entity extends SyncEntity {
    data = createSyncComponent({ count: 0 });
  }

  const e = new Entity();
  e.data.count = 1;
  e.data.count = 2;

  const patch = e.flush();
  expect(patch).toEqual([[PatchType.Update, ["data"], { count: 2 }]]);
});

it("does not collect changes to non decorated fields", () => {
  class Entity extends SyncEntity {
    data = createSyncComponent({ count: 0 });

    notCollected = "value";
  }

  const e = new Entity();
  e.notCollected = "changed";
  const patch = e.flush();
  expect(patch).toEqual([]);
});

it("can select component properties", () => {
  class Entity extends SyncEntity {
    data = createSyncComponent({ count: 0, name: "" });

    notCollected = "value";
  }

  const e = new Entity();
  e.data.count = 1;
  e.data.name = "john";
  const props = Object.fromEntries(Object.entries(e.data));
  expect(props).toEqual({ count: 1, name: "john" });
});

describe("effects", () => {
  it("can listen to changes in components", () => {
    class Entity extends SyncEntity {
      data = createSyncComponent({ value: "initial" });
    }

    let received: unknown;
    const fn = vi.fn((arg) => {
      received = arg;
    });
    const e = new Entity();
    effect(() => fn(e.data.value));
    e.data.value = "first";
    e.data.value = "second";
    expect(fn).toHaveBeenCalledTimes(3);
    expect(received).toEqual("second");
  });

  it("can stop listening to changes on class instances", () => {
    class Entity extends SyncEntity {
      data = createSyncComponent({ value: "initial" });
    }

    let received: unknown;
    const fn = vi.fn((arg) => {
      received = arg;
    });
    const e = new Entity();

    const stop = effect(() => fn(e.data.value));

    e.data.value = "first";

    stop();

    e.data.value = "second";

    expect(fn).toHaveBeenCalledTimes(2); // one when effect inits, another when e.count = "first"
    expect(received).toEqual("first");
  });
});
