import { applyPatch } from "@mp/patch";
import { effect } from "@mp/state";
import { describe, expect, it, vi } from "vitest";
import { defineSyncComponent } from "../src/sync-component";

it("can collect changes as patch", () => {
  const Component = defineSyncComponent((builder) =>
    builder.add<number>()("count"),
  );

  const c = new Component({ count: 0 });
  c.count = 1;
  c.count = 2;

  const patch = c.flush();

  const c2 = new Component({ count: 0 });
  applyPatch(c2, patch);
  expect(c2.count).toBe(2);
});

it("does not collect changes to non decorated fields", () => {
  const Base = defineSyncComponent((builder) => builder.add<number>()("count"));
  class Component extends Base {
    notCollected = "value";
  }

  const c = new Component({ count: 0 });
  c.notCollected = "changed";
  const patch = c.flush();
  expect(patch).toEqual([]);
});

it("can select collectable subset", () => {
  const Base = defineSyncComponent((builder) =>
    builder.add<number>()("count").add<string>()("name"),
  );
  class Component extends Base {
    notCollected = "value";
  }

  const c = new Component({ count: 0, name: "" });
  c.count = 1;
  c.name = "john";
  const subset = c.snapshot();
  expect(subset).toEqual({ count: 1, name: "john" });
});

it("can collect nested changes as patch", () => {
  const Stats = defineSyncComponent((builder) =>
    builder.add<number>()("count"),
  );
  const Base = defineSyncComponent((builder) => builder.add<string>()("name"));
  class Entity extends Base {
    readonly stats = new Stats({ count: 0 });
  }

  const e = new Entity({ name: "" });
  e.name = "john";
  e.stats.count = 2;

  const patch = e.flush();

  const e2 = new Entity({ name: "" });
  applyPatch(e2, patch);
  expect(e2.name).toBe("john");
  expect(e2.stats.count).toBe(2);
});

describe("effects", () => {
  it("can listen to changes on class instances", () => {
    const Component = defineSyncComponent((builder) =>
      builder.add<string>()("value"),
    );

    let received: unknown;
    const fn = vi.fn((arg) => {
      received = arg;
    });
    const c = new Component({ value: "initial" });
    effect(() => fn(c.value));
    c.value = "first";
    c.value = "second";
    expect(fn).toHaveBeenCalledTimes(3);
    expect(received).toEqual("second");
  });

  it("can stop listening to changes on class instances", () => {
    const Component = defineSyncComponent((builder) =>
      builder.add<string>()("value"),
    );

    let received: unknown;
    const fn = vi.fn((arg) => {
      received = arg;
    });
    const c = new Component({ value: "initial" });

    const stop = effect(() => fn(c.value));

    c.value = "first";

    stop();

    c.value = "second";

    expect(fn).toHaveBeenCalledTimes(2); // one when effect inits, another when c.count = "first"
    expect(received).toEqual("first");
  });
});
