import { beforeEach, expect, it } from "vitest";
import { SyncSystem } from "../src";

let systemA: SyncSystem;
let systemB: SyncSystem;

beforeEach(() => {
  systemA = new SyncSystem();
  systemB = new SyncSystem();
});

it("initially has no entities or components", () => {
  expect([...systemA.entities]).toEqual([]);
  expect([...systemA.components]).toEqual([]);
});

it("set adds component to entity and stores component value", () => {
  const value = { foo: "bar" };
  systemA.set("entity1", "component1", value);
  expect([...systemA.entities]).toEqual([["entity1", new Set(["component1"])]]);
  expect(systemA.components.get("component1")).toBe(value);
});

it("set on same component updates value and does not duplicate entity mapping", () => {
  systemA.set("e1", "c1", 1);
  systemA.set("e1", "c1", 2);
  expect([...systemA.entities]).toEqual([["e1", new Set(["c1"])]]);
  expect(systemA.components.get("c1")).toBe(2);
});

it("delete removes entity and its components", () => {
  systemA.set("e1", "c1", 1);
  systemA.set("e1", "c2", 2);
  systemA.set("e2", "c3", 3);
  systemA.delete("e1");

  expect(systemA.entities.has("e1")).toBe(false);
  expect(systemA.components.has("c1")).toBe(false);
  expect(systemA.components.has("c2")).toBe(false);

  // Other entities/components remain unaffected
  expect(systemA.entities.has("e2")).toBe(true);
  expect(systemA.components.get("c3")).toBe(3);
});

it("delete non-existent entity is no-op", () => {
  expect(() => systemA.delete("nope")).not.toThrow();
  expect([...systemA.entities]).toEqual([]);
  expect([...systemA.components]).toEqual([]);
});

it("flush and applyPatch replicates state to another system", () => {
  systemA.set("e1", "c1", 1);
  systemA.set("e2", "c2", { a: 2 });

  const patch = systemA.flush();

  // Original remains correct
  expect([...systemA.entities]).toHaveLength(2);
  expect([...systemA.components]).toHaveLength(2);

  // Apply to fresh system
  systemB.applyPatch(patch);
  expect([...systemB.entities]).toEqual([...systemA.entities]);
  expect([...systemB.components]).toEqual([...systemA.components]);
});

it("flush resets patches so subsequent flush is empty", () => {
  systemA.set("e1", "c1", 1);
  const patch1 = systemA.flush();
  systemB.applyPatch(patch1);

  // No new changes
  const patch2 = systemA.flush();
  const before = [...systemB.entities];

  systemB.applyPatch(patch2);
  expect([...systemB.entities]).toEqual(before);
});

it("applyPatch is idempotent when applied multiple times", () => {
  systemA.set("e", "c", true);
  const patch = systemA.flush();

  systemB.applyPatch(patch);
  systemB.applyPatch(patch);

  expect([...systemB.entities]).toEqual([...systemA.entities]);
  expect([...systemB.components]).toEqual([...systemA.components]);
});

it("supports arbitrary value types including null and undefined", () => {
  systemA.set("e", "cNull", null);
  systemA.set("e", "cUndef", undefined);

  expect(systemA.components.get("cNull")).toBeNull();
  expect(systemA.components.get("cUndef")).toBeUndefined();

  const patch = systemA.flush();
  systemB.applyPatch(patch);

  expect(systemB.components.get("cNull")).toBeNull();
  expect(systemB.components.get("cUndef")).toBeUndefined();
});
