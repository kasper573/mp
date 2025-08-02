import {
  ArraySchema,
  MapSchema,
  ObjectSchema,
  OptionalSchema,
  PartialObjectSchema,
  SetSchema,
  type Schema,
} from "./schema";

export type TypeNode =
  | ObjectNode
  | ArrayNode
  | MapNode
  | SetNode
  | PrimitiveNode
  | ObjectUnionNode;

interface ObjectNode {
  id: number; // Unique identifier
  type: "Object";
  properties: Record<string, TypeNode>;
}

/**
 * Represents a union of multiple object types.
 * This is used to represent cases where a property can be one of several object types, identified by their unique IDs.
 */
interface ObjectUnionNode {
  type: "Union";
  members: ObjectNode[];
}

/**
 * Represents a JS Array
 */
interface ArrayNode {
  type: "Array";
  value: TypeNode;
}

/**
 * Represents a JS Map
 */
interface MapNode {
  type: "Map";
  key: TypeNode;
  value: TypeNode;
}

/**
 * Represents a JS Set
 */
interface SetNode {
  type: "Set";
  value: TypeNode;
}

/**
 * Represents a primitive value like string, number, boolean, null, or undefined.
 */
interface PrimitiveNode {
  type: "Primitive";
}

export function getTypeInfo<T>(schema: Schema<T>): TypeNode {
  if (schema instanceof PartialObjectSchema) {
    return getTypeInfo(schema.objectSchema);
  }
  if (schema instanceof OptionalSchema) {
    return getTypeInfo(schema.valueSchema);
  }
  if (schema instanceof ObjectSchema) {
    return {
      id: schema.typeId,
      type: "Object",
      properties: Object.fromEntries(
        Object.entries(schema.propertySchemas).map(([key, value]) => [
          key,
          getTypeInfo(value),
        ]),
      ),
    };
  }
  if (schema instanceof ArraySchema) {
    return {
      type: "Array",
      value: getTypeInfo(schema.elementSchema),
    };
  }
  if (schema instanceof MapSchema) {
    return {
      type: "Map",
      key: getTypeInfo(schema.keySchema),
      value: getTypeInfo(schema.valueSchema),
    };
  }
  if (schema instanceof SetSchema) {
    return {
      type: "Set",
      value: getTypeInfo(schema.valueSchema),
    };
  }
  return { type: "Primitive" };
}
