import {
  array,
  boolean,
  float32,
  float64,
  int16,
  int32,
  map,
  object,
  optional,
  partial,
  set,
  string,
} from "@mp/encoding/schema";
import type { TypeNode } from "@mp/patch-tracker/graph";
import { expect, it } from "vitest";
import { getTypeGraph } from "../src";

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
