import type { Schema } from "./schemas/abstract";
import { ArraySchema } from "./schemas/array";
import { MapSchema } from "./schemas/map";
import { ObjectSchema } from "./schemas/object";
import { OptionalSchema } from "./schemas/optional";
import { PartialObjectSchema } from "./schemas/partial";
import { SetSchema } from "./schemas/set";

export type TypeNode =
  | ObjectNode
  | ArrayNode
  | MapNode
  | SetNode
  | PrimitiveNode
  | ObjectUnionNode;

export interface ObjectNode {
  id: number; // Unique identifier
  type: "Object";
  properties: Record<string, TypeNode>;
}

/**
 * Represents a union of multiple object types.
 * This is used to represent cases where a property can be one of several object types, identified by their unique IDs.
 */
export interface ObjectUnionNode {
  type: "Union";
  members: ObjectNode[];
}

/**
 * Represents a JS Array
 */
export interface ArrayNode {
  type: "Array";
  value: TypeNode;
}

/**
 * Represents a JS Map
 */
export interface MapNode {
  type: "Map";
  key: TypeNode;
  value: TypeNode;
}

/**
 * Represents a JS Set
 */
export interface SetNode {
  type: "Set";
  value: TypeNode;
}

/**
 * Represents a primitive value like string, number, boolean, null, or undefined.
 */
export interface PrimitiveNode {
  type: "Primitive";
}

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
