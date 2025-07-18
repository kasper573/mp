import * as v from "valibot";
import { ColorSchema, ObjectIdSchema, TiledClassSchema } from "./common";

const BasePropertySchema = v.object({
  name: v.string(),
  propertytype: v.optional(v.string()),
});

export const StringPropertySchema = v.object({
  ...BasePropertySchema.entries,
  type: v.literal("string"),
  value: v.string(),
});

export const IntPropertySchema = v.object({
  ...BasePropertySchema.entries,
  type: v.literal("int"),
  value: v.number(),
});

export const FloatPropertySchema = v.object({
  ...BasePropertySchema.entries,
  type: v.literal("float"),
  value: v.number(),
});

export const BoolPropertySchema = v.object({
  ...BasePropertySchema.entries,
  type: v.literal("bool"),
  value: v.boolean(),
});

export const ColorPropertySchema = v.object({
  ...BasePropertySchema.entries,
  type: v.literal("color"),
  value: ColorSchema,
});

export const ObjectPropertySchema = v.object({
  ...BasePropertySchema.entries,
  type: v.literal("object"),
  value: ObjectIdSchema,
});

export const ClassPropertySchema = v.object({
  ...BasePropertySchema.entries,
  type: v.literal("class"),
  value: TiledClassSchema,
});

export const PropertySchema = v.union([
  StringPropertySchema,
  IntPropertySchema,
  FloatPropertySchema,
  BoolPropertySchema,
  ColorPropertySchema,
  ObjectPropertySchema,
  ClassPropertySchema,
]);

export type Property = v.InferOutput<typeof PropertySchema>;

export const PropertyMapSchema = v.pipe(
  v.optional(v.array(PropertySchema), []),
  v.transform((properties) => new Map(properties.map((prop) => [prop.name, prop])))
);

export type PropertyMap = v.InferOutput<typeof PropertyMapSchema>;