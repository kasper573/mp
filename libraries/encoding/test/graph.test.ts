import { expect, it } from "vitest";
import type { TypeNode } from "../src/graph";
import { getTypeGraph } from "../src/graph";
import { array } from "../src/schemas/array";
import { boolean } from "../src/schemas/boolean";
import { float32 } from "../src/schemas/float32";
import { float64 } from "../src/schemas/float64";
import { int16 } from "../src/schemas/int16";
import { int32 } from "../src/schemas/int32";
import { map } from "../src/schemas/map";
import { object } from "../src/schemas/object";
import { optional } from "../src/schemas/optional";
import { partial } from "../src/schemas/partial";
import { set } from "../src/schemas/set";
import { string } from "../src/schemas/string";

it("can get type info for schemas", () => {
  const schemaContainingEverything = optional(
    partial(
      object(1, {
        str: string(),
        int16: int16(),
        int32: int32(),
        float32: float32(),
        float64: float64(),
        bool: boolean(),
        optionalBool: optional(boolean()),
        array: array(string()),
        set: set(string()),
        map: map(string(), string()),
        entitySet: set(
          object(2, {
            name: string(),
            value: int32(),
          }),
        ),
      }),
    ),
  );

  const info = getTypeGraph(schemaContainingEverything);

  const expected: TypeNode = {
    type: "Object",
    id: 1,
    properties: {
      str: { type: "Primitive" },
      int16: { type: "Primitive" },
      int32: { type: "Primitive" },
      float32: { type: "Primitive" },
      float64: { type: "Primitive" },
      bool: { type: "Primitive" },
      optionalBool: { type: "Primitive" },
      array: {
        type: "Array",
        value: { type: "Primitive" },
      },
      set: {
        type: "Set",
        value: { type: "Primitive" },
      },
      map: {
        type: "Map",
        key: { type: "Primitive" },
        value: { type: "Primitive" },
      },
      entitySet: {
        type: "Set",
        value: {
          id: 2,
          type: "Object",
          properties: {
            name: { type: "Primitive" },
            value: { type: "Primitive" },
          },
        },
      },
    },
  };

  expect(info).toEqual(expected);
});
