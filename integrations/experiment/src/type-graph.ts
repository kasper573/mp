import type { Schema } from "@mp/encoding/schema";
import { ObjectSchema, OptionalSchema } from "@mp/encoding/schema";

export function objectSchemaToTypeGraph<T>(schema: ObjectSchema<T>): Graph {
  const graph: Graph = {};
  for (const key in schema.propertySchemas) {
    graph[key] = schemaToTypeNode(schema.propertySchemas[key]);
  }
  return graph;
}

function schemaToTypeNode<T>(schema: Schema<T>): Graph | null {
  if (schema instanceof ObjectSchema) {
    return objectSchemaToTypeGraph(schema);
  }
  if (schema instanceof OptionalSchema) {
    return schemaToTypeNode(schema.valueSchema);
  }
  return null;
}

export interface Graph {
  [key: string]: Graph | null;
}
