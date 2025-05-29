import { beforeEach } from "node:test";
import { describe, expect, it } from "vitest";
import { PatchCollector } from "../src/patch-collector";
import { applyPatch, type Patch } from "../src/patch";

describe("basic object behavior", () => {
  const Entity = new PatchCollector<{
    name: string;
    cash: number;
  }>();

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
    const Nested = new PatchCollector<{
      foo: {
        bar: string;
      };
    }>();

    const entity = Nested.create({ foo: { bar: "baz" } });
    entity.foo.bar = "qux";
    expect(entity).toEqual({ foo: { bar: "qux" } });
  });

  it("can perform deep mutations by default (array push)", () => {
    const Nested = new PatchCollector<{
      list: unknown[];
    }>();

    const entity = Nested.create({ list: [] });
    entity.list.push(123);
    expect(entity).toEqual({ list: [123] });
  });

  it("can opt-in to prevent deep mutations (array push)", () => {
    const Nested = new PatchCollector<{
      list: unknown[];
    }>();

    Nested.restrictDeepMutations = true;

    const entity = Nested.create({ list: [] });
    expect(() => entity.list.push(123)).toThrow();
  });

  it("can opt-in to prevent deep mutations (object property set)", () => {
    const Nested = new PatchCollector<{
      foo: {
        bar: string;
      };
    }>();

    Nested.restrictDeepMutations = true;

    const entity = Nested.create({ foo: { bar: "baz" } });
    expect(() => (entity.foo.bar = "qux")).toThrow();
  });

  it("can opt-in to prevent deep mutations (array push)", () => {
    const Nested = new PatchCollector<{
      list: unknown[];
    }>();

    Nested.restrictDeepMutations = true;

    const entity = Nested.create({ list: [] });
    expect(() => entity.list.push(123)).toThrow();
  });
});

describe("patch collection", () => {
  const Entity = new PatchCollector<{
    name: string;
    cash: number;
  }>();

  const patch: Patch = [];
  beforeEach(() => patch.splice(0, patch.length));
  Entity.setReceiver((op) => patch.push(op));

  it("collects a patch when a property is mutated", () => {
    const initialData = { name: "john", cash: 100 };
    const entity = Entity.create(initialData);
    entity.name = "jane";

    const target = structuredClone(initialData);
    applyPatch(target, patch);
    expect(target).toEqual({ name: "jane", cash: 100 });
  });
});
