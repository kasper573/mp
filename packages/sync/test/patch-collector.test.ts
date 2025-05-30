import { beforeEach } from "node:test";
import { describe, expect, it } from "vitest";
import { PatchCollectorFactory } from "../src/patch-collector";
import type { PatchPath } from "../src/patch";
import { applyPatch, PatchType, type Patch } from "../src/patch";

describe("basic object behavior", () => {
  const Entity = new PatchCollectorFactory<{
    name: string;
    cash: number;
  }>();

  beforeEach(() => {
    PatchCollectorFactory.restrictDeepMutations = false;
  });

  it("instance is structurally equal to its initial data", () => {
    const initialData = { name: "john", cash: 100 };
    const entity = Entity.create(initialData);
    expect(entity).toEqual(initialData);
  });

  it("can read a property value", () => {
    const initialData = { name: "john", cash: 100 };
    const entity = Entity.create(initialData);
    expect(entity.name).toEqual("john");
    expect(entity.cash).toEqual(100);
  });

  it("can mutate a property", () => {
    const entity = Entity.create({ name: "john", cash: 100 });
    entity.name = "jane";
    expect(entity).toEqual({ name: "jane", cash: 100 });
  });

  it("can perform deep mutations by default (object property set)", () => {
    const Nested = new PatchCollectorFactory<{
      foo: {
        bar: string;
      };
    }>();

    const entity = Nested.create({ foo: { bar: "baz" } });
    entity.foo.bar = "qux";
    expect(entity).toEqual({ foo: { bar: "qux" } });
  });

  it("can perform deep mutations by default (array push)", () => {
    const Nested = new PatchCollectorFactory<{
      list: unknown[];
    }>();

    const entity = Nested.create({ list: [] });
    entity.list.push(123);
    expect(entity).toEqual({ list: [123] });
  });

  it("can opt-in to prevent deep mutations (array push)", () => {
    const Nested = new PatchCollectorFactory<{
      list: unknown[];
    }>();

    PatchCollectorFactory.restrictDeepMutations = true;

    const entity = Nested.create({ list: [] });
    expect(() => entity.list.push(123)).toThrow();
  });

  it("can opt-in to prevent deep mutations (object property set)", () => {
    const Nested = new PatchCollectorFactory<{
      foo: {
        bar: string;
      };
    }>();

    PatchCollectorFactory.restrictDeepMutations = true;

    const entity = Nested.create({ foo: { bar: "baz" } });
    expect(() => (entity.foo.bar = "qux")).toThrow();
  });

  it("can opt-in to prevent deep mutations (array push)", () => {
    const Nested = new PatchCollectorFactory<{
      list: unknown[];
    }>();

    PatchCollectorFactory.restrictDeepMutations = true;

    const entity = Nested.create({ list: [] });
    expect(() => entity.list.push(123)).toThrow();
  });
});

describe("patch collection", () => {
  it("can observe mutations on entities", () => {
    const Entity = new PatchCollectorFactory<{
      name: string;
      cash: number;
    }>();

    const patch: Patch = [];

    Entity.subscribe(({ key, value }) =>
      patch.push([PatchType.Set, [key] as PatchPath, value]),
    );

    const initialData = { name: "john", cash: 100 };
    const target = structuredClone(initialData);

    const entity = Entity.create(initialData);
    entity.name = "jane";

    applyPatch(target, patch);
    expect(target).toEqual({ name: "jane", cash: 100 });
  });

  describe("can observe mutations on entity records", () => {
    it("set", () => {
      const Entity = new PatchCollectorFactory<
        { name: string; cash: number },
        string
      >((entity) => entity.name);

      const patch: Patch = [];
      const source = Entity.record();

      source.$subscribe((op) => patch.push(op));
      source["john"] = Entity.create({ name: "john", cash: 123 });

      const receiver = {};
      applyPatch(receiver, patch);
      expect(receiver).toEqual(
        Object.fromEntries([["john", { name: "john", cash: 123 }]]),
      );
    });

    it("delete", () => {
      type Data = { id: string; cash: number };
      const Entity = new PatchCollectorFactory<Data, string>((e) => e.id);
      const patch: Patch = [];

      const john = Entity.create({ id: "john", cash: 0 });
      const jane = Entity.create({ id: "jane", cash: 50 });
      const source = Entity.record([
        [john.id, john],
        [jane.id, jane],
      ]);

      source.$subscribe((op) => patch.push(op));
      delete source[john.id];

      const receiver = Object.fromEntries([
        [john.id, { id: john.id, cash: 0 }],
        [jane.id, { id: jane.id, cash: 50 }],
      ]);

      applyPatch(receiver, patch);
      expect(receiver).toEqual(
        Object.fromEntries([[jane.id, { id: jane.id, cash: 50 }]]),
      );
    });

    it("entity mutation", () => {
      type Data = { id: string; cash: number };
      const Entity = new PatchCollectorFactory<Data, Data["id"]>((e) => e.id);
      const patch: Patch = [];

      const john = Entity.create({ id: "john", cash: 0 });
      const source = Entity.record([[john.id, john]]);

      source.$subscribe((op) => patch.push(op));
      john.cash = 25;

      const receiver = Object.fromEntries([
        [john.id, { id: john.id, cash: 0 }],
      ]);

      applyPatch(receiver, patch);
      expect(receiver).toEqual(
        Object.fromEntries([[john.id, { id: john.id, cash: 25 }]]),
      );
    });
  });
});
