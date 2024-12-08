import { describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";
import { boolean, number, object, parse, string } from "valibot";
import { parseEnv } from "../src/parseEnv.ts";
import {
  booleanString,
  boolish,
  csv,
  numeric,
  numericString,
} from "../src/schemas.ts";

it("can parse nesting convention", () => {
  const schema = object({
    foo: object({
      bar: object({
        baz: number(),
      }),
      barHello: string(),
    }),
    root: boolean(),
  });

  const env = {
    FOO__BAR__BAZ: 42,
    FOO__BAR_HELLO: "cool",
    ROOT: true,
  };

  const result = parseEnv(schema, env);
  expect(result).toEqual({
    value: {
      foo: {
        bar: {
          baz: 42,
        },
        barHello: "cool",
      },
      root: true,
    },
  });
});

describe("custom schemas", () => {
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
        expect(parse(booleanString(), input)).toBe(expected);
      });
    }

    const errors = ["tru", "5"];

    for (const input of errors) {
      it(`errors on "${input}"`, () => {
        expect(() => parse(booleanString(), input)).toThrow();
      });
    }
  });

  describe("numericString", () => {
    it(`parses "5.5" as 5.5`, () => {
      expect(parse(numericString(), "5.5")).toBe(5.5);
    });

    it(`parses "5" as 5`, () => {
      expect(parse(numericString(), "5")).toBe(5);
    });

    const errors = ["5p", "A"];

    for (const input of errors) {
      it(`errors on "${input}"`, () => {
        expect(() => parse(numericString(), input)).toThrow();
      });
    }
  });

  describe("boolish", () => {
    it("parses boolean", () => {
      expect(parse(boolish(), true)).toBe(true);
      expect(parse(boolish(), false)).toBe(false);
    });
    it("parses boolean string", () => {
      expect(parse(boolish(), "true")).toBe(true);
      expect(parse(boolish(), "false")).toBe(false);
    });
  });

  describe("numeric", () => {
    it("parses number", () => {
      expect(parse(numeric(), 5.5)).toBe(5.5);
      expect(parse(numeric(), 5)).toBe(5);
    });
    it("parses numeric string", () => {
      expect(parse(numeric(), "5.5")).toBe(5.5);
      expect(parse(numeric(), "5")).toBe(5);
    });
  });

  describe("csv", () => {
    it("without spacing", () => {
      const res = parse(csv(numeric()), "1,2,3");
      expect(res).toEqual([1, 2, 3]);
    });
    it("with spacing", () => {
      const res = parse(csv(numeric()), "1, 2, 3");
      expect(res).toEqual([1, 2, 3]);
    });
  });
});
