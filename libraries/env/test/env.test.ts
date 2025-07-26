import { expect, it } from "vitest";
import { type } from "@mp/validate";
import { parseEnv } from "../src";

it("can parse nesting convention", () => {
  const schema = type({
    foo: {
      bar: {
        baz: "number",
      },
      barHello: "string",
    },
    root: "boolean",
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
