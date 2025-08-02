import type { Schema } from "@mp/encoding/schema";
import {
  ArraySchema,
  MapSchema,
  ObjectSchema,
  OptionalSchema,
  PartialObjectSchema,
  SetSchema,
} from "@mp/encoding/schema";
import type { TypeNode } from "@mp/patch-tracker/graph";

export function getTypeGraph<T>(schema: Schema<T>): TypeNode {
  if (schema instanceof PartialObjectSchema) {
    return getTypeGraph(schema.objectSchema);
  }
  if (schema instanceof OptionalSchema) {
    return getTypeGraph(schema.valueSchema);
  }
  if (schema instanceof ObjectSchema) {
    return {
      id: schema.typeId,
      type: "Object",
      properties: Object.fromEntries(
        Object.entries(schema.propertySchemas).map(([key, value]) => [
          key,
          getTypeGraph(value),
        ]),
      ),
    };
  }
  if (schema instanceof ArraySchema) {
    return {
      type: "Array",
      value: getTypeGraph(schema.elementSchema),
    };
  }
  if (schema instanceof MapSchema) {
    return {
      type: "Map",
      key: getTypeGraph(schema.keySchema),
      value: getTypeGraph(schema.valueSchema),
    };
  }
  if (schema instanceof SetSchema) {
    return {
      type: "Set",
      value: getTypeGraph(schema.valueSchema),
    };
  }
  return { type: "Primitive" };
}
