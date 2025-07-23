import { describe, expect, it, vi } from "vitest";
import { effect } from "@mp/state";
import { defineSyncComponent } from "../src/sync-component";
import { PatchType } from "../src/patch";

it("can collect changes as patch", () => {
  const Component = defineSyncComponent((builder) => builder.add("count", 0));

  const c = new Component();
  c.count = 1;
  c.count = 2;

  const patch = c.flush();
  expect(patch).toEqual([[PatchType.Update, [], { count: 2 }]]);
});

it("does not collect changes to non decorated fields", () => {
  const Base = defineSyncComponent((builder) => builder.add("count", 0));
  class Component extends Base {
    notCollected = "value";
  }

  const c = new Component();
  c.notCollected = "changed";
  const patch = c.flush();
  expect(patch).toEqual([]);
});

it("can select collectable subset", () => {
  const Base = defineSyncComponent((builder) =>
    builder.add("count", 0).add("name", ""),
  );
  class Component extends Base {
    notCollected = "value";
  }

  const c = new Component();
  c.count = 1;
  c.name = "john";
  const subset = c.snapshot();
  expect(subset).toEqual({ count: 1, name: "john" });
});

it("can collect nested changes as patch", () => {
  const Stats = defineSyncComponent((builder) => builder.add("count", 0));
  const Base = defineSyncComponent((builder) => builder.add("name", ""));
  class Entity extends Base {
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

it("can define component property without initializer", () => {
  const Component = defineSyncComponent((builder) => builder.add("count"));

  const c = new Component({ count: 1 });

  expect(c.count).toBe(1);
});

it("cannot create components that lack property initializers without providing an initial value", () => {
  const Component = defineSyncComponent((builder) => builder.add("count"));

  expect(() => new Component()).toThrow();
});

describe("effects", () => {
  it("can listen to changes on class instances", () => {
    const Component = defineSyncComponent((builder) =>
      builder.add("value", "initial"),
    );

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
    const Component = defineSyncComponent((builder) =>
      builder.add("value", "initial"),
    );

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
