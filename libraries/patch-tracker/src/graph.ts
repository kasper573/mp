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
