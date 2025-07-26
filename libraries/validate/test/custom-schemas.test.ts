import { describe, expect, it } from "vitest";
import {
  booleanString,
  boolish,
  csv,
  numeric,
  numericString,
} from "../src/custom-schemas";

describe("booleanString", () => {
  const success = {
    true: true,
    false: false,
    "1": true,
    "0": false,
    yes: true,
    no: false,
    on: true,
    off: false,
  };

  for (const [input, expected] of Object.entries(success)) {
    it(`parses "${input}" as ${expected}`, () => {
      expect(booleanString().from(input)).toBe(expected);
    });
  }

  const errors = ["tru", "5"];

  for (const input of errors) {
    it(`errors on "${input}"`, () => {
      expect(() => booleanString().from(input)).toThrow();
    });
  }
});

describe("numericString", () => {
  it(`parses "5.5" as 5.5`, () => {
    expect(numericString().from("5.5")).toBe(5.5);
  });

  it(`parses "5" as 5`, () => {
    expect(numericString().from("5")).toBe(5);
  });

  const errors = ["5p", "A"];

  for (const input of errors) {
    it(`errors on "${input}"`, () => {
      expect(() => numericString().from(input)).toThrow();
    });
  }
});

describe("boolish", () => {
  it("parses boolean", () => {
    expect(boolish().from(true)).toBe(true);
    expect(boolish().from(false)).toBe(false);
  });
  it("parses boolean string", () => {
    expect(boolish().from("true")).toBe(true);
    expect(boolish().from("false")).toBe(false);
  });
});

describe("numeric", () => {
  it("parses number", () => {
    expect(numeric().from(5.5)).toBe(5.5);
    expect(numeric().from(5)).toBe(5);
  });
  it("parses numeric string", () => {
    expect(numeric().from("5.5")).toBe(5.5);
    expect(numeric().from("5")).toBe(5);
  });
});

describe("csv", () => {
  it("without spacing", () => {
    const res = csv(numeric()).from("1,2,3");
    expect(res).toEqual([1, 2, 3]);
  });
  it("with spacing", () => {
    const res = csv(numeric()).from("1, 2, 3");
    expect(res).toEqual([1, 2, 3]);
  });
});
