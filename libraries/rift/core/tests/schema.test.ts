import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { defineSchema } from "../src/index";
import { f32, object, string, u32 } from "@rift/types";

function sha256(input: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(input).digest());
}

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

describe("schema", () => {
  it("identical component arrays produce identical digests", () => {
    const a = defineSchema({
      components: [object({ x: f32(), y: f32() }), string()],
      events: [],
      hash: sha256,
    });
    const b = defineSchema({
      components: [object({ x: f32(), y: f32() }), string()],
      events: [],
      hash: sha256,
    });
    expect(hex(a.digest())).toBe(hex(b.digest()));
  });
  it("reordering components changes the digest (position is identity)", () => {
    const a = defineSchema({
      components: [object({ x: f32(), y: f32() }), string()],
      events: [],
      hash: sha256,
    });
    const b = defineSchema({
      components: [string(), object({ x: f32(), y: f32() })],
      events: [],
      hash: sha256,
    });
    expect(hex(a.digest())).not.toBe(hex(b.digest()));
  });
  it("reordering events changes the digest", () => {
    const a = defineSchema({
      components: [],
      events: [object({ dx: f32(), dy: f32() }), object({ h: u32() })],
      hash: sha256,
    });
    const b = defineSchema({
      components: [],
      events: [object({ h: u32() }), object({ dx: f32(), dy: f32() })],
      hash: sha256,
    });
    expect(hex(a.digest())).not.toBe(hex(b.digest()));
  });
  it("changing a component type changes the digest", () => {
    const a = defineSchema({
      components: [u32()],
      events: [],
      hash: sha256,
    });
    const b = defineSchema({
      components: [f32()],
      events: [],
      hash: sha256,
    });
    expect(hex(a.digest())).not.toBe(hex(b.digest()));
  });
  it("empty schema has a stable digest", () => {
    const a = defineSchema({ components: [], events: [], hash: sha256 });
    const b = defineSchema({ components: [], events: [], hash: sha256 });
    expect(hex(a.digest())).toBe(hex(b.digest()));
    expect(a.digest().byteLength).toBe(32);
  });
  it("component and event sections are distinct", () => {
    const a = defineSchema({
      components: [u32()],
      events: [],
      hash: sha256,
    });
    const b = defineSchema({
      components: [],
      events: [u32()],
      hash: sha256,
    });
    expect(hex(a.digest())).not.toBe(hex(b.digest()));
  });
  it("componentIndexOf returns array position", () => {
    const pos = object({ x: f32(), y: f32() });
    const name = string();
    const s = defineSchema({
      components: [pos, name],
      events: [],
      hash: sha256,
    });
    expect(s.componentIndexOf(pos)).toBe(0);
    expect(s.componentIndexOf(name)).toBe(1);
  });
  it("eventIndexOf returns array position", () => {
    const ev1 = u32();
    const ev2 = string();
    const s = defineSchema({
      components: [],
      events: [ev1, ev2],
      hash: sha256,
    });
    expect(s.eventIndexOf(ev1)).toBe(0);
    expect(s.eventIndexOf(ev2)).toBe(1);
  });
  it("digest is cached across calls", () => {
    const s = defineSchema({ components: [u32()], events: [], hash: sha256 });
    const d1 = s.digest();
    const d2 = s.digest();
    expect(d1).toBe(d2);
  });
});
