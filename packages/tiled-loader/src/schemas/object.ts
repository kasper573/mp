import * as v from "valibot";
import {
  GlobalTileIdSchema,
  ObjectIdSchema,
  PixelSchema,
  DegreesSchema,
  TiledClassSchema,
  CoordSchema,
} from "./common";
import { PropertyMapSchema } from "./property";
import { Vector } from "@mp/math";
import type { Pixel } from "@mp/std";

// For backward compatibility, we'll keep the global ID flags
export const GlobalIdFlagsSchema = v.object({
  horizontalFlip: v.boolean(),
  verticalFlip: v.boolean(),
  diagonalFlip: v.boolean(),
});

export type GlobalIdFlags = v.InferOutput<typeof GlobalIdFlagsSchema>;

// Raw tiled input format - transforms x/y/width/height to position/size vectors
const SharedObjectPropertiesSchema = v.pipe(
  v.object({
    gid: v.optional(GlobalTileIdSchema),
    flags: v.optional(GlobalIdFlagsSchema),
    id: ObjectIdSchema,
    name: v.string(),
    x: PixelSchema,
    y: PixelSchema,
    width: PixelSchema,
    height: PixelSchema,
    rotation: DegreesSchema,
    type: v.optional(TiledClassSchema),
    visible: v.boolean(),
    properties: v.optional(PropertyMapSchema, new Map()),
  }),
  v.transform(({ x, y, width, height, properties, ...rest }) => ({
    ...rest,
    position: new Vector(x as Pixel, y as Pixel),
    size: new Vector(width as Pixel, height as Pixel),
    properties: properties || new Map(),
  }))
);

export const EllipseObjectSchema = v.pipe(
  v.object({
    ...SharedObjectPropertiesSchema.entries,
    ellipse: v.optional(v.boolean()),
  }),
  v.transform((input) => {
    const base = SharedObjectPropertiesSchema.parse(input);
    return {
      ...base,
      objectType: "ellipse" as const,
    };
  })
);

export const PointObjectSchema = v.pipe(
  v.object({
    ...SharedObjectPropertiesSchema.entries,
    point: v.optional(v.boolean()),
  }),
  v.transform((input) => {
    const base = SharedObjectPropertiesSchema.parse(input);
    return {
      ...base,
      objectType: "point" as const,
    };
  })
);

export const PolygonObjectSchema = v.pipe(
  v.object({
    ...SharedObjectPropertiesSchema.entries,
    polygon: v.array(CoordSchema),
  }),
  v.transform((input) => {
    const base = SharedObjectPropertiesSchema.parse(input);
    return {
      ...base,
      objectType: "polygon" as const,
      polygon: input.polygon,
    };
  })
);

export const PolylineObjectSchema = v.pipe(
  v.object({
    ...SharedObjectPropertiesSchema.entries,
    polyline: v.array(CoordSchema),
  }),
  v.transform((input) => {
    const base = SharedObjectPropertiesSchema.parse(input);
    return {
      ...base,
      objectType: "polyline" as const,
      polyline: input.polyline,
    };
  })
);

export const TextObjectSchema = v.pipe(
  v.object({
    ...SharedObjectPropertiesSchema.entries,
    text: v.any(), // TODO: Define text schema
  }),
  v.transform((input) => {
    const base = SharedObjectPropertiesSchema.parse(input);
    return {
      ...base,
      objectType: "text" as const,
      text: input.text,
    };
  })
);

export const RectangleObjectSchema = v.pipe(
  v.object({
    ...SharedObjectPropertiesSchema.entries,
  }),
  v.transform((input) => {
    const base = SharedObjectPropertiesSchema.parse(input);
    return {
      ...base,
      objectType: "rectangle" as const,
    };
  })
);

export const TiledObjectSchema = v.union([
  EllipseObjectSchema,
  PointObjectSchema,
  PolygonObjectSchema,
  PolylineObjectSchema,
  TextObjectSchema,
  RectangleObjectSchema,
]);

export type TiledObject = v.InferOutput<typeof TiledObjectSchema>;