import { describe, expect, it, vi } from "vitest";
import { effect } from "@mp/state";
import { collect, SyncComponent } from "../src/sync-component";
import { PatchType } from "../src/patch";

it("can collect changes as patch", () => {
  class Component extends SyncComponent {
    @collect()
    accessor count: number = 0;
  }

  const c = new Component();
  c.count = 1;
  c.count = 2;

  const patch = c.flush();
  expect(patch).toEqual([[PatchType.Update, [], { count: 2 }]]);
});

it("does not collect changes to non decorated fields", () => {
  class Component extends SyncComponent {
    @collect()
    accessor count: number = 0;

    notCollected = "value";
  }

  const c = new Component();
  c.notCollected = "changed";
  const patch = c.flush();
  expect(patch).toEqual([]);
});

it("can select collectable subset", () => {
  class Component extends SyncComponent {
    @collect()
    accessor count: number = 0;

    @collect()
    accessor name: string = "";

    notCollected = "value";
  }

  const c = new Component();
  c.count = 1;
  c.name = "john";
  const subset = c.snapshot();
  expect(subset).toEqual({ count: 1, name: "john" });
});

it("can collect nested changes as patch", () => {
  class Stats extends SyncComponent {
    @collect()
    accessor count: number = 0;
  }

  class Entity extends SyncComponent {
    @collect()
    accessor name: string = "";
    readonly stats = new Stats();
  }

  const e = new Entity();
  e.name = "john";
  e.stats.count = 2;

  const patch = e.flush();
  expect(patch).toEqual([
    [PatchType.Update, [], { name: "john" }],
    [PatchType.Update, ["stats"], { count: 2 }],
  ]);
});

describe("effects", () => {
  it("can listen to changes on class instances", () => {
    class Component extends SyncComponent {
      @collect()
      accessor value: string = "initial";
    }

    let received: unknown;
    const fn = vi.fn((arg) => {
      received = arg;
    });
    const c = new Component();
    effect(() => fn(c.value));
    c.value = "first";
    c.value = "second";
    expect(fn).toHaveBeenCalledTimes(3);
    expect(received).toEqual("second");
  });

  it("can stop listening to changes on class instances", () => {
    class Component extends SyncComponent {
      @collect()
      accessor value: string = "initial";
    }

    let received: unknown;
    const fn = vi.fn((arg) => {
      received = arg;
    });
    const c = new Component();

    const stop = effect(() => fn(c.value));

    c.value = "first";

    stop();

    c.value = "second";

    expect(fn).toHaveBeenCalledTimes(2); // one when effect inits, another when c.count = "first"
    expect(received).toEqual("first");
  });
});
