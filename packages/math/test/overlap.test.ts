import { Rect } from "../src";
import { expect, it, describe } from "vitest";

describe("Rect.overlap", () => {
  it("25% overlap bottom right corner", () => {
    const r1 = Rect.fromComponents<number>(0, 0, 2, 2);
    const r2 = Rect.fromComponents<number>(1, 1, 2, 2);
    expect(r1.overlap(r2)).toBe(0.25);
  });

  it("no overlap", () => {
    const r1 = Rect.fromComponents<number>(0, 0, 2, 2);
    const r2 = Rect.fromComponents<number>(3, 3, 2, 2);
    expect(r1.overlap(r2)).toBe(0);
  });

  it("full overlap (identical rectangles)", () => {
    const r1 = Rect.fromComponents<number>(0, 0, 2, 2);
    const r2 = Rect.fromComponents<number>(0, 0, 2, 2);
    expect(r1.overlap(r2)).toBe(1);
  });

  it("r2 fully inside r1", () => {
    const r1 = Rect.fromComponents<number>(0, 0, 4, 4);
    const r2 = Rect.fromComponents<number>(1, 1, 2, 2);
    expect(r1.overlap(r2)).toBeCloseTo(0.25);
  });

  it("r1 fully inside r2", () => {
    const r1 = Rect.fromComponents<number>(1, 1, 2, 2);
    const r2 = Rect.fromComponents<number>(0, 0, 4, 4);
    expect(r1.overlap(r2)).toBe(1);
  });

  it("edge touch, no overlap", () => {
    const r1 = Rect.fromComponents<number>(0, 0, 2, 2);
    const r2 = Rect.fromComponents<number>(2, 0, 2, 2);
    expect(r1.overlap(r2)).toBe(0);
  });

  it("partial overlap on one axis", () => {
    const r1 = Rect.fromComponents<number>(0, 0, 2, 2);
    const r2 = Rect.fromComponents<number>(1, 0, 2, 2);
    expect(r1.overlap(r2)).toBe(0.5);
  });

  it("partial overlap on both axes", () => {
    const r1 = Rect.fromComponents<number>(0, 0, 3, 3);
    const r2 = Rect.fromComponents<number>(1, 1, 3, 3);
    expect(r1.overlap(r2)).toBeCloseTo(4 / 9);
  });

  it("zero area rectangle", () => {
    const r1 = Rect.fromComponents<number>(0, 0, 0, 2);
    const r2 = Rect.fromComponents<number>(0, 0, 2, 2);
    expect(r1.overlap(r2)).toBe(0);
  });

  it("negative width/height", () => {
    const r1 = Rect.fromComponents<number>(0, 0, -2, 2);
    const r2 = Rect.fromComponents<number>(0, 0, 2, 2);
    expect(r1.overlap(r2)).toBe(0);
  });
});
