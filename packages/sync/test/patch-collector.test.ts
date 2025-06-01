import { describe, expect, it } from "vitest";
import {
  flushInstance,
  flushRecord,
  PatchCollectorFactory,
} from "../src/patch-collector";
import { applyPatch, type Patch } from "../src/patch";

describe("basic object behavior", () => {
  const Entity = new PatchCollectorFactory<{
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
});

describe("patch collection", () => {
  it("can observe mutations on entities", () => {
    const Entity = new PatchCollectorFactory<{
      name: string;
      cash: number;
    }>();

    const initialData = { name: "john", cash: 100 };
    const target = structuredClone(initialData);

    const entity = Entity.create(initialData);
    entity.name = "jane";

    const patch: Patch = flushInstance(entity);

    applyPatch(target, patch);
    expect(target).toEqual({ name: "jane", cash: 100 });
  });

  it("flushing immediately after creating instance returns an empty patch", () => {
    const Entity = new PatchCollectorFactory<{
      name: string;
    }>();

    const entity = Entity.create({ name: "john" });

    const patch: Patch = flushInstance(entity);

    expect(patch).toEqual([]);
  });

  it("assigning an unchanged property value yields an empty patch", () => {
    const Entity = new PatchCollectorFactory<{
      name: string;
    }>();

    const entity = Entity.create({ name: "john" });
    entity.name = "john";

    const patch: Patch = flushInstance(entity);

    expect(patch).toEqual([]);
  });

  describe("can observe mutations on entity records", () => {
    it("set", () => {
      interface Entity {
        name: string;
        cash: number;
      }
      const EntityFactory = new PatchCollectorFactory<Entity>();

      const source: Record<string, Entity> = {};
      source["john"] = EntityFactory.create({ name: "john", cash: 123 });

      const patch = flushRecord(source);

      const receiver = {};
      applyPatch(receiver, patch);
      expect(receiver).toEqual(
        Object.fromEntries([["john", { name: "john", cash: 123 }]]),
      );
    });

    it("delete", () => {
      interface Entity {
        id: string;
        cash: number;
      }
      const EntityFactory = new PatchCollectorFactory<Entity>();

      const john = EntityFactory.create({ id: "john", cash: 0 });
      const jane = EntityFactory.create({ id: "jane", cash: 50 });
      const source = Object.fromEntries([
        [john.id, john],
        [jane.id, jane],
      ]);

      // Flush initial state
      const receiver = Object.fromEntries([]);
      applyPatch(receiver, flushRecord(source));

      // Apply and flush delete
      delete source[john.id];
      applyPatch(receiver, flushRecord(source));

      expect(receiver).toEqual(
        Object.fromEntries([[jane.id, { id: jane.id, cash: 50 }]]),
      );
    });

    it("entity mutation", () => {
      interface Entity {
        id: string;
        cash: number;
      }
      const EntityFactory = new PatchCollectorFactory<Entity>();

      const john = EntityFactory.create({ id: "john", cash: 0 });
      const source = Object.fromEntries([[john.id, john]]);

      john.cash = 25;

      const receiver = Object.fromEntries([
        [john.id, { id: john.id, cash: 0 }],
      ]);

      const patch = flushRecord(source);

      applyPatch(receiver, patch);
      expect(receiver).toEqual(
        Object.fromEntries([[john.id, { id: john.id, cash: 25 }]]),
      );
    });
  });
});
