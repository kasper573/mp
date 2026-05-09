import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { effect } from "@preact/signals-core";
import { f32, object, string, u32 } from "@rift/types";
import { type EntityId, defineSchema, createWorld } from "@rift/core";
import { attachReactive } from "../src/index";

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

describe("attachReactive", () => {
  it("entity signal emits values for current components", () => {
    const w = createWorld(schema);
    const r = attachReactive(w);
    const id = w.create();
    w.add(id, pos, { x: 1, y: 2 });
    w.add(id, name, "alpha");
    const sig = r.entity(id, pos, name);
    expect(sig.value).toEqual([{ x: 1, y: 2 }, "alpha"]);
  });

  it("entity signal updates only when a tracked component changes", () => {
    const w = createWorld(schema);
    const r = attachReactive(w);
    const id = w.create();
    w.add(id, pos, { x: 0, y: 0 });
    w.add(id, score, 10);
    const sig = r.entity(id, pos);
    let runs = 0;
    const stop = effect(() => {
      void sig.value;
      runs++;
    });
    expect(runs).toBe(1);

    // pos change → signal re-evaluates
    w.write(id, pos, { x: 5 });
    expect(runs).toBe(2);

    // score change → not tracked by this signal, no re-eval
    w.write(id, score, 20);
    expect(runs).toBe(2);

    stop();
  });

  it("entities signal updates on entity create/destroy", () => {
    const w = createWorld(schema);
    const r = attachReactive(w);
    const a = w.create();
    w.add(a, score, 1);
    const sig = r.entities(score);
    expect(sig.value.length).toBe(1);

    const b = w.create();
    w.add(b, score, 2);
    expect(sig.value.length).toBe(2);

    w.destroy(a);
    expect(sig.value.length).toBe(1);
  });

  it("entities signal updates on component add/remove for matching entities", () => {
    const w = createWorld(schema);
    const r = attachReactive(w);
    const a = w.create();
    w.add(a, name, "a");
    const b = w.create();
    w.add(b, name, "b");
    const sig = r.entities(name, score);
    expect(sig.value.length).toBe(0);

    w.add(a, score, 10);
    expect(sig.value.length).toBe(1);

    w.remove(a, score);
    expect(sig.value.length).toBe(0);
  });

  it("entities signal subscribes even when initial result is empty", () => {
    const w = createWorld(schema);
    const r = attachReactive(w);
    const sig = r.entities(score);
    expect(sig.value.length).toBe(0);
    const a = w.create();
    w.add(a, score, 1);
    expect(sig.value.length).toBe(1);
  });

  it("find signal returns first matching row, undefined when none match", () => {
    const w = createWorld(schema);
    const r = attachReactive(w);
    const a = w.create();
    w.add(a, score, 5);
    const b = w.create();
    w.add(b, score, 25);
    const sig = r.find((_id, n) => n > 10, score);
    expect(sig.value?.[0]).toBe(b);

    w.write(b, score, 0);
    expect(sig.value).toBeUndefined();

    w.write(a, score, 100);
    expect(sig.value?.[0]).toBe(a);
  });

  it("entity(undefined, ...) yields all-undefined values", () => {
    const w = createWorld(schema);
    const r = attachReactive(w);
    const sig = r.entity(undefined as EntityId | undefined, pos, name);
    expect(sig.value).toEqual([undefined, undefined]);
  });
});
