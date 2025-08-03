// test/tracker.test.ts
import { applyPatch } from "@mp/patch";
import { describe, expect, it } from "vitest";
import type { TrackedObject } from "../src/tracker";
import {
  defineTrackedObject,
  TrackedArray,
  TrackedMap,
  TrackedSet,
} from "../src/tracker";

describe("TrackedObject", () => {
  interface TestObj {
    foo: number;
    bar: string;
  }

  const TestObj = defineTrackedObject<TestObj>(["foo", "bar"]);

  it("supports changing properties", () => {
    const tracked = new TestObj({ foo: 1, bar: "initial" });
    tracked.foo = 42;
    expect(tracked.foo).toBe(42);
    tracked.bar = "changed";
    expect(tracked.bar).toBe("changed");
  });

  it("should record patches for property sets", () => {
    const tracked = new TestObj({ foo: 1, bar: "initial" });
    tracked.foo = 100;
    tracked.bar = "foo";
    const patch = tracked.flush();
    const target = { foo: 1, bar: "initial" };
    applyPatch(target, patch);
    expect(target.foo).toBe(100);
    expect(target.bar).toBe("foo");
  });

  it("should clear internal patch after flushing", () => {
    const tracked = new TestObj({ foo: 1, bar: "initial" });
    tracked.foo = 5;
    const first = tracked.flush();
    expect(first).toHaveLength(1);
    const second = tracked.flush();
    expect(second).toEqual([]);
    expect(first).toHaveLength(1);
  });

  it("should apply prefix to paths when flushing", () => {
    const tracked = new TestObj({ foo: 1, bar: "initial" });
    tracked.bar = "changed";
    const patch = tracked.flush(["nested"]);
    const target: { nested: TestObj } = { nested: { foo: 1, bar: "initial" } };
    applyPatch(target, patch);
    expect(target.nested.bar).toBe("changed");
  });
});

describe("TrackedArray", () => {
  it("push should add elements and record patch", () => {
    const arr = new TrackedArray<number>();
    arr.push(1, 2);
    expect(arr).toEqual([1, 2]);
    const patch = arr.flush();
    const target: number[] = [];
    applyPatch(target, patch);
    expect(target).toEqual([1, 2]);
  });

  it("pop should remove last element and record patch", () => {
    const arr = new TrackedArray<number>(1, 2, 3);
    const popped = arr.pop();
    expect(popped).toBe(3);
    expect(arr).toEqual([1, 2]);
    const patch = arr.flush();
    const target: number[] = [1, 2, 3];
    applyPatch(target, patch);
    expect(target).toEqual([1, 2]);
  });

  it("shift should remove first element and record patch", () => {
    const arr = new TrackedArray<number>(10, 20);
    const shifted = arr.shift();
    expect(shifted).toBe(10);
    expect(arr).toEqual([20]);
    const patch = arr.flush();
    const target = [10, 20];
    applyPatch(target, patch);
    expect(target).toEqual([20]);
  });

  it("unshift should add elements at front and record patch", () => {
    const arr = new TrackedArray<number>(2, 3);
    arr.unshift(5);
    expect(arr).toEqual([5, 2, 3]);
    const patch = arr.flush();
    const target: number[] = [2, 3];
    applyPatch(target, patch);
    expect(target).toEqual([5, 2, 3]);
  });

  it("splice should modify array and record patch", () => {
    const arr = new TrackedArray<number>(1, 2, 3);
    const removed = arr.splice(1, 1, 4, 5);
    expect(removed).toEqual([2]);
    expect(arr).toEqual([1, 4, 5, 3]);
    const patch = arr.flush();
    const target: number[] = [1, 2, 3];
    applyPatch(target, patch);
    expect(target).toEqual([1, 4, 5, 3]);
  });
});

describe("TrackedMap", () => {
  it("set should add or update entry and record patch", () => {
    const map = new TrackedMap<string, number>();
    map.set("foo", 10);
    expect(map.get("foo")).toBe(10);
    const patch = map.flush();
    const target = new Map();
    applyPatch(target, patch);
    expect(target.get("foo")).toBe(10);
  });

  it("delete should remove entry and record patch", () => {
    const map = new TrackedMap<string, number>([["bar", 2]]);
    const deleted = map.delete("bar");
    expect(deleted).toBe(true);
    const patch = map.flush();
    const target = new Map([["bar", 2]]);
    applyPatch(target, patch);
    expect(target.has("bar")).toBe(false);
  });

  it("flush with prefix should apply prefix", () => {
    const map = new TrackedMap<string, number>([["baz", 3]]);
    map.set("qux", 4);
    const patch = map.flush(["nested"]);
    const target = { nested: new Map<string, number>() };
    applyPatch(target, patch);
    expect(target.nested.get("qux")).toBe(4);
  });
});

describe("TrackedSet", () => {
  it("add should include element and record patch", () => {
    const set = new TrackedSet<number>([1]);
    set.add(2);
    expect(set.has(2)).toBe(true);
    const patch = set.flush();
    const target = new Set<number>([1]);
    applyPatch(target, patch);
    expect(target.has(2)).toBe(true);
  });

  it("delete should remove element and record patch", () => {
    const set = new TrackedSet<number>([1, 2]);
    const deleted = set.delete(1);
    expect(deleted).toBe(true);
    expect(set.has(1)).toBe(false);
    const patch = set.flush();
    const target = new Set<number>([1, 2]);
    applyPatch(target, patch);
    expect(target.has(1)).toBe(false);
  });
});

it.skip("Complex combination", () => {
  type ItemContainerId = string;
  interface State {
    areaId: string;
    itemContainers: TrackedMap<ItemContainerId, TrackedArray<Item>>;
    actors: TrackedMap<string, TrackedObject<Actor>>;
  }
  interface Item {
    id: string;
    name: string;
    power: number;
  }
  interface Actor {
    id: string;
    name: string;
    health: number;
    inventoryId: ItemContainerId;
  }
  const State = defineTrackedObject<State>([
    "areaId",
    "itemContainers",
    "actors",
  ]);
  const Item = defineTrackedObject<Item>(["id", "name", "power"]);
  const Actor = defineTrackedObject<Actor>([
    "id",
    "name",
    "health",
    "inventoryId",
  ]);

  const source = createComplexState();

  source.state.areaId = "forest";
  source.actor.health = 50;
  source.item.power = 100;

  const patch = source.state.flush();

  expect(patch).toEqual([]);

  const target = createComplexState();

  applyPatch(target, patch);

  expect(target.state.areaId).toBe("forest");
  expect(target.actor.health).toBe(50);
  expect(target.item.power).toBe(100);

  function createComplexState() {
    const item = new Item({
      id: "1",
      name: "Sword",
      power: 20,
    });

    const itemContainer = {
      id: "A",
      items: new TrackedArray(item),
    };

    const actor = new Actor({
      id: "Z",
      inventoryId: itemContainer.id,
      name: "John",
      health: 100,
    });

    const state = new State({
      actors: new TrackedMap([[actor.id, actor]]),
      areaId: "initial",
      itemContainers: new TrackedMap([[itemContainer.id, itemContainer.items]]),
    });

    return { state, actor, item };
  }
});
