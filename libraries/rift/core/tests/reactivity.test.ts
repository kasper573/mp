import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { computed, effect } from "@preact/signals-core";
import { defineSchema } from "../src/index";
import { createWorld } from "../src/world";
import { f32, object, string, u32 } from "@rift/types";

function sha256(input: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(input).digest());
}

const pos = object({ x: f32(), y: f32() });
const name = string();
const score = u32();

const schema = defineSchema({
  components: [pos, name, score],
  events: [],
  hash: sha256,
});

describe("world reactivity", () => {
  it("effect re-runs when a leaf component value mutates via set", () => {
    const w = createWorld(schema);
    const id = w.create();
    w.add(id, score, 0);
    let runs = 0;
    const stop = effect(() => {
      w.get(id, score);
      runs++;
    });
    expect(runs).toBe(1);
    w.set(id, score, 5);
    expect(runs).toBe(2);
    stop();
  });

  it("computed over query tracks value changes of existing entities", () => {
    const w = createWorld(schema);
    const a = w.create();
    w.add(a, score, 0);
    const total = computed(() => {
      let sum = 0;
      for (const [, s] of w.query(score)) {
        sum += s;
      }
      return sum;
    });
    expect(total.value).toBe(0);
    w.set(a, score, 7);
    expect(total.value).toBe(7);
  });

  it("computed over query updates when a new matching entity is added", () => {
    const w = createWorld(schema);
    const a = w.create();
    w.add(a, score, 1);
    const rows = computed(() => [...w.query(score)].map(([id]) => id));
    expect(rows.value.length).toBe(1);
    const b = w.create();
    w.add(b, score, 2);
    expect(rows.value.length).toBe(2);
  });

  it("computed over query updates when a matching entity is destroyed", () => {
    const w = createWorld(schema);
    const a = w.create();
    w.add(a, score, 1);
    const b = w.create();
    w.add(b, score, 2);
    const ids = computed(() => [...w.query(score)].map(([id]) => id));
    expect(ids.value.length).toBe(2);
    w.destroy(a);
    expect(ids.value.length).toBe(1);
    expect(ids.value[0]).toBe(b);
  });

  it("computed over query updates when a component is removed", () => {
    const w = createWorld(schema);
    const a = w.create();
    w.add(a, score, 1);
    const ids = computed(() => [...w.query(score)].map(([id]) => id));
    expect(ids.value.length).toBe(1);
    w.remove(a, score);
    expect(ids.value.length).toBe(0);
  });

  it("computed over query updates when a component is added later to existing entity", () => {
    const w = createWorld(schema);
    const a = w.create();
    w.add(a, name, "a");
    const b = w.create();
    w.add(b, name, "b");
    const withScore = computed(() => [...w.query(name, score)].length);
    expect(withScore.value).toBe(0);
    w.add(a, score, 10);
    expect(withScore.value).toBe(1);
  });

  it("computed over query subscribes even when index is initially empty", () => {
    const w = createWorld(schema);
    const rows = computed(() => [...w.query(score)].length);
    expect(rows.value).toBe(0);
    const a = w.create();
    w.add(a, score, 1);
    expect(rows.value).toBe(1);
  });

  it("effect on world.has re-runs on add/remove", () => {
    const w = createWorld(schema);
    const id = w.create();
    const seen: boolean[] = [];
    const stop = effect(() => {
      seen.push(w.has(id, score));
    });
    expect(seen).toEqual([false]);
    w.add(id, score, 1);
    expect(seen).toEqual([false, true]);
    w.remove(id, score);
    expect(seen).toEqual([false, true, false]);
    stop();
  });
});
