import { describe, expect, it, vi } from "vitest";
import { effect } from "@mp/state";
import { defineSyncComponent } from "../src/sync-component";
import { PatchType } from "../src/patch";

it("can collect changes as patch", () => {
  const Component = defineSyncComponent((builder) =>
    builder.add<number>()("count"),
  );

  const c = new Component({ count: 0 });
  c.count = 1;
  c.count = 2;

  const patch = c.flush();
  expect(patch).toEqual([[PatchType.Update, [], { count: 2 }]]);
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
  expect(patch).toEqual([
    [PatchType.Update, [], { name: "john" }],
    [PatchType.Update, ["stats"], { count: 2 }],
  ]);
});

it("can flush initial state of nested components", () => {
  type Bank = typeof Bank.$infer;

  const Bank = defineSyncComponent((builder) => builder.add<number>()("cash"));

  const Base = defineSyncComponent((builder) => builder.add<string>()("name"));

  class Outer extends Base {
    readonly bank = new Bank({ cash: 0 });
  }

  const char = new Outer({ name: "" });
  char.name = "jane";
  char.bank.cash = 50;
  const patch = char.flush();

  expect(patch).toEqual([
    [PatchType.Update, [], { name: "jane" }],
    [PatchType.Update, ["bank"], { cash: 50 }],
  ]);
});

it("can flush updates of nested components", () => {
  type Bank = typeof Bank.$infer;

  const Bank = defineSyncComponent((builder) => builder.add<number>()("cash"));

  const Base = defineSyncComponent((builder) => builder.add<string>()("name"));

  class Outer extends Base {
    readonly bank = new Bank({ cash: 0 });
  }

  const char = new Outer({ name: "" });

  char.name = "john";
  char.bank.cash = 25;
  char.flush(); // Discard initial state

  char.name = "jane";
  char.bank.cash = 50;

  const patch = char.flush();

  expect(patch).toEqual([
    [PatchType.Update, [], { name: "jane" }],
    [PatchType.Update, ["bank"], { cash: 50 }],
  ]);
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
