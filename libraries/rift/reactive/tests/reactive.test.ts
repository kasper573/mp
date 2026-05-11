import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computed, effect } from "@preact/signals-core";
import { f32, object, string, u32 } from "@rift/types";
import { defineSchema } from "@rift/core";
import { ReactiveWorld } from "../src/index";

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

describe("ReactiveWorld imperative reads", () => {
  it("get(id, A) returns the current value without a reactive scope", () => {
    const w = new ReactiveWorld(schema);
    const id = w.create();
    w.add(id, pos, { x: 1, y: 2 });
    expect(w.get(id, pos)).toEqual({ x: 1, y: 2 });
  });

  it("get(id, A, B) returns a tuple without a reactive scope", () => {
    const w = new ReactiveWorld(schema);
    const id = w.create();
    w.add(id, pos, { x: 1, y: 2 });
    w.add(id, name, "alpha");
    expect(w.get(id, pos, name)).toEqual([{ x: 1, y: 2 }, "alpha"]);
  });
});

describe("ReactiveWorld auto-tracks inside an effect", () => {
  it("get(id, A) triggers re-run when A is written", () => {
    const w = new ReactiveWorld(schema);
    const id = w.create();
    w.add(id, pos, { x: 0, y: 0 });
    w.add(id, score, 10);

    const seen: Array<{ x: number; y: number } | undefined> = [];
    const stop = effect(() => {
      seen.push(w.get(id, pos));
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ x: 0, y: 0 });

    w.write(id, pos, { x: 5 });
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({ x: 5, y: 0 });

    w.write(id, score, 20);
    expect(seen).toHaveLength(2);

    stop();
  });

  it("query(...) re-runs on entity create/destroy", () => {
    const w = new ReactiveWorld(schema);
    const a = w.create();
    w.add(a, score, 1);

    const sizes: number[] = [];
    const stop = effect(() => {
      sizes.push([...w.query(score)].length);
    });

    expect(sizes).toEqual([1]);

    const b = w.create();
    w.add(b, score, 2);
    expect(sizes.at(-1)).toBe(2);

    w.destroy(a);
    expect(sizes.at(-1)).toBe(1);

    stop();
  });

  it("query(...) re-runs on component value mutations", () => {
    const w = new ReactiveWorld(schema);
    const a = w.create();
    w.add(a, score, 1);

    let runs = 0;
    const stop = effect(() => {
      for (const _row of w.query(score)) {
        // touch each row so the version subscription registers
        void _row;
      }
      runs++;
    });
    expect(runs).toBe(1);

    w.write(a, score, 99);
    expect(runs).toBe(2);

    stop();
  });

  it("query(A, B) re-runs when matching set membership changes", () => {
    const w = new ReactiveWorld(schema);
    const a = w.create();
    w.add(a, name, "a");
    const b = w.create();
    w.add(b, name, "b");

    let lastLen = -1;
    const stop = effect(() => {
      lastLen = [...w.query(name, score)].length;
    });
    expect(lastLen).toBe(0);

    w.add(a, score, 10);
    expect(lastLen).toBe(1);

    w.remove(a, score);
    expect(lastLen).toBe(0);

    stop();
  });

  it("query(...) subscribes even when the initial result is empty", () => {
    const w = new ReactiveWorld(schema);

    let lastLen = -1;
    const stop = effect(() => {
      lastLen = [...w.query(score)].length;
    });
    expect(lastLen).toBe(0);

    const a = w.create();
    w.add(a, score, 1);
    expect(lastLen).toBe(1);

    stop();
  });

  it("entities(...types) does NOT re-run on value mutations", () => {
    const w = new ReactiveWorld(schema);
    const a = w.create();
    w.add(a, score, 1);

    let runs = 0;
    const stop = effect(() => {
      void w.entities(score);
      runs++;
    });
    expect(runs).toBe(1);

    w.write(a, score, 99);
    expect(runs).toBe(1);

    const b = w.create();
    w.add(b, score, 2);
    expect(runs).toBeGreaterThan(1);

    stop();
  });

  it("entities() with no args returns the full set and tracks structure", () => {
    const w = new ReactiveWorld(schema);
    const a = w.create();

    let lastSize = -1;
    const stop = effect(() => {
      lastSize = w.entities().size;
    });
    expect(lastSize).toBe(1);

    const b = w.create();
    expect(lastSize).toBe(2);

    w.destroy(a);
    expect(lastSize).toBe(1);
    void b;
    stop();
  });

  it("has(id, A) re-runs on add/remove of A", () => {
    const w = new ReactiveWorld(schema);
    const a = w.create();

    const seen: boolean[] = [];
    const stop = effect(() => {
      seen.push(w.has(a, score));
    });
    expect(seen).toEqual([false]);

    w.add(a, score, 1);
    expect(seen.at(-1)).toBe(true);

    w.remove(a, score);
    expect(seen.at(-1)).toBe(false);

    stop();
  });

  it("exists(id) re-runs when the entity is destroyed", () => {
    const w = new ReactiveWorld(schema);
    const a = w.create();

    const seen: boolean[] = [];
    const stop = effect(() => {
      seen.push(w.exists(a));
    });
    expect(seen).toEqual([true]);

    w.destroy(a);
    expect(seen.at(-1)).toBe(false);

    stop();
  });
});

describe("ReactiveWorld.memo", () => {
  it("returns the same signal across calls (memoizes per world)", () => {
    const w = new ReactiveWorld(schema);
    const countNames = ReactiveWorld.memo(
      (world) => [...world.query(name)].length,
    );
    expect(countNames(w)).toBe(countNames(w));
  });

  it("memoized signal re-runs only when its inputs change", () => {
    const w = new ReactiveWorld(schema);
    const countNames = ReactiveWorld.memo(
      (world) => [...world.query(name)].length,
    );

    let runs = 0;
    const stop = effect(() => {
      void countNames(w).value;
      runs++;
    });
    expect(runs).toBe(1);

    const a = w.create();
    w.add(a, score, 10);
    expect(runs).toBe(1);

    w.add(a, name, "a");
    expect(runs).toBeGreaterThan(1);

    stop();
  });

  it("composes: outer memo subscribes to inner memo signal", () => {
    const w = new ReactiveWorld(schema);
    const inner = ReactiveWorld.memo((world) => [...world.query(score)].length);
    const outer = ReactiveWorld.memo((world) => inner(world).value * 10);

    expect(outer(w).value).toBe(0);

    const a = w.create();
    w.add(a, score, 1);
    expect(outer(w).value).toBe(10);
  });

  it("plain computed wrapping world methods also tracks", () => {
    const w = new ReactiveWorld(schema);
    const a = w.create();
    w.add(a, pos, { x: 0, y: 0 });
    const c = computed(() => w.get(a, pos)?.x ?? -1);
    expect(c.value).toBe(0);
    w.write(a, pos, { x: 7 });
    expect(c.value).toBe(7);
  });
});
