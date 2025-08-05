import type { PropertySchemas, Schema } from "@mp/encoding/schema";
import { ObjectSchema, OptionalSchema } from "@mp/encoding/schema";

export interface SchemaAnalysis {
  shape: Shape;
  flat: PropertySchemas<Record<string, unknown>>;
}

export interface Shape {
  [key: string]: Shape | null;
}

export function analyzeSchema<T>(schema: ObjectSchema<T>): SchemaAnalysis {
  const flat: SchemaAnalysis["flat"] = {};
  const shape = visitObjectSchema(schema, [], flat);
  return { shape, flat };
}

function visitObjectSchema<T>(
  schema: ObjectSchema<T>,
  path: string[],
  flat: SchemaAnalysis["flat"],
): Shape {
  const shape: Shape = {};
  for (const key in schema.propertySchemas) {
    shape[key] = visitSchema(
      schema.propertySchemas[key],
      path.concat(key),
      flat,
    );
  }
  return shape;
}

function visitSchema<T>(
  schema: Schema<T>,
  path: string[],
  flat: SchemaAnalysis["flat"],
): Shape | null {
  if (schema instanceof ObjectSchema) {
    return visitObjectSchema(schema, path, flat);
  }
  if (schema instanceof OptionalSchema) {
    return visitSchema(schema.valueSchema, path, flat);
  }
  flat[path.join(".")] = schema;
  return null;
}
