import * as v from "valibot";
import { Vector } from "@mp/math";
import type { Tile, Pixel } from "@mp/std";
import {
  ColorSchema,
  CompressionLevelSchema,
  LayerIdSchema,
  MapRenderOrderSchema,
  ObjectIdSchema,
  StaggerAxisSchema,
  StaggerIndexSchema,
  TiledClassSchema,
  PixelSchema,
  TileSchema,
} from "./common";

// Shared map properties that will be transformed
const _SharedMapPropertiesSchema = v.pipe(
  v.object({
    type: v.literal("map"),
    version: v.string(),
    tiledversion: v.string(),

    // These will be handled by specific schemas
    tilesets: v.array(v.any()), // TODO: Replace with TilesetSchema
    properties: v.optional(v.array(v.any()), []), // TODO: Replace with PropertyMapSchema
    layers: v.array(v.any()), // TODO: Replace with LayerSchema

    backgroundcolor: v.optional(ColorSchema),
    class: v.optional(TiledClassSchema),

    // Transform these to vectors
    width: TileSchema,
    height: TileSchema,
    tilewidth: PixelSchema,
    tileheight: PixelSchema,
    parallaxoriginx: PixelSchema,
    parallaxoriginy: PixelSchema,

    infinite: v.boolean(),
    compressionlevel: CompressionLevelSchema,
    nextlayerid: LayerIdSchema,
    nextobjectid: ObjectIdSchema,
  }),
  v.transform(
    ({
      width,
      height,
      tilewidth,
      tileheight,
      parallaxoriginx,
      parallaxoriginy,
      properties,
      ...rest
    }) => ({
      ...rest,
      size: new Vector(width as Tile, height as Tile),
      tileSize: new Vector(tilewidth as Pixel, tileheight as Pixel),
      parallaxOrigin: new Vector(
        parallaxoriginx as Pixel,
        parallaxoriginy as Pixel,
      ),
      properties: properties || [],
    }),
  ),
);

export const OrthogonalMapSchema = v.pipe(
  v.object({
    type: v.literal("map"),
    version: v.string(),
    tiledversion: v.string(),
    tilesets: v.array(v.any()),
    properties: v.optional(v.array(v.any()), []),
    layers: v.array(v.any()),
    backgroundcolor: v.optional(ColorSchema),
    class: v.optional(TiledClassSchema),
    width: TileSchema,
    height: TileSchema,
    tilewidth: PixelSchema,
    tileheight: PixelSchema,
    parallaxoriginx: v.optional(PixelSchema, 0 as Pixel),
    parallaxoriginy: v.optional(PixelSchema, 0 as Pixel),
    infinite: v.boolean(),
    compressionlevel: CompressionLevelSchema,
    nextlayerid: LayerIdSchema,
    nextobjectid: ObjectIdSchema,
    renderorder: MapRenderOrderSchema,
    orientation: v.literal("orthogonal"),
  }),
  v.transform(
    ({
      width,
      height,
      tilewidth,
      tileheight,
      parallaxoriginx,
      parallaxoriginy,
      properties,
      renderorder,
      orientation,
      ...rest
    }) => ({
      ...rest,
      size: new Vector(width, height),
      tileSize: new Vector(tilewidth, tileheight),
      parallaxOrigin: new Vector(parallaxoriginx, parallaxoriginy),
      properties: properties || [],
      renderorder,
      orientation,
    }),
  ),
);

export const IsometricMapSchema = v.pipe(
  v.object({
    type: v.literal("map"),
    version: v.string(),
    tiledversion: v.string(),
    tilesets: v.array(v.any()),
    properties: v.optional(v.array(v.any()), []),
    layers: v.array(v.any()),
    backgroundcolor: v.optional(ColorSchema),
    class: v.optional(TiledClassSchema),
    width: TileSchema,
    height: TileSchema,
    tilewidth: PixelSchema,
    tileheight: PixelSchema,
    parallaxoriginx: v.optional(PixelSchema, 0 as Pixel),
    parallaxoriginy: v.optional(PixelSchema, 0 as Pixel),
    infinite: v.boolean(),
    compressionlevel: CompressionLevelSchema,
    nextlayerid: LayerIdSchema,
    nextobjectid: ObjectIdSchema,
    orientation: v.literal("isometric"),
  }),
  v.transform(
    ({
      width,
      height,
      tilewidth,
      tileheight,
      parallaxoriginx,
      parallaxoriginy,
      properties,
      orientation,
      ...rest
    }) => ({
      ...rest,
      size: new Vector(width, height),
      tileSize: new Vector(tilewidth, tileheight),
      parallaxOrigin: new Vector(parallaxoriginx, parallaxoriginy),
      properties: properties || [],
      orientation,
    }),
  ),
);

export const StaggeredMapSchema = v.pipe(
  v.object({
    type: v.literal("map"),
    version: v.string(),
    tiledversion: v.string(),
    tilesets: v.array(v.any()),
    properties: v.optional(v.array(v.any()), []),
    layers: v.array(v.any()),
    backgroundcolor: v.optional(ColorSchema),
    class: v.optional(TiledClassSchema),
    width: TileSchema,
    height: TileSchema,
    tilewidth: PixelSchema,
    tileheight: PixelSchema,
    parallaxoriginx: v.optional(PixelSchema, 0 as Pixel),
    parallaxoriginy: v.optional(PixelSchema, 0 as Pixel),
    infinite: v.boolean(),
    compressionlevel: CompressionLevelSchema,
    nextlayerid: LayerIdSchema,
    nextobjectid: ObjectIdSchema,
    staggeraxis: StaggerAxisSchema,
    staggerindex: StaggerIndexSchema,
    orientation: v.literal("staggered"),
  }),
  v.transform(
    ({
      width,
      height,
      tilewidth,
      tileheight,
      parallaxoriginx,
      parallaxoriginy,
      properties,
      staggeraxis,
      staggerindex,
      orientation,
      ...rest
    }) => ({
      ...rest,
      size: new Vector(width, height),
      tileSize: new Vector(tilewidth, tileheight),
      parallaxOrigin: new Vector(parallaxoriginx, parallaxoriginy),
      properties: properties || [],
      staggeraxis,
      staggerindex,
      orientation,
    }),
  ),
);

export const HexagonalMapSchema = v.pipe(
  v.object({
    type: v.literal("map"),
    version: v.string(),
    tiledversion: v.string(),
    tilesets: v.array(v.any()),
    properties: v.optional(v.array(v.any()), []),
    layers: v.array(v.any()),
    backgroundcolor: v.optional(ColorSchema),
    class: v.optional(TiledClassSchema),
    width: TileSchema,
    height: TileSchema,
    tilewidth: PixelSchema,
    tileheight: PixelSchema,
    parallaxoriginx: v.optional(PixelSchema, 0 as Pixel),
    parallaxoriginy: v.optional(PixelSchema, 0 as Pixel),
    infinite: v.boolean(),
    compressionlevel: CompressionLevelSchema,
    nextlayerid: LayerIdSchema,
    nextobjectid: ObjectIdSchema,
    hexsidelength: PixelSchema,
    staggeraxis: StaggerAxisSchema,
    staggerindex: StaggerIndexSchema,
    orientation: v.literal("hexagonal"),
  }),
  v.transform(
    ({
      width,
      height,
      tilewidth,
      tileheight,
      parallaxoriginx,
      parallaxoriginy,
      properties,
      hexsidelength,
      staggeraxis,
      staggerindex,
      orientation,
      ...rest
    }) => ({
      ...rest,
      size: new Vector(width, height),
      tileSize: new Vector(tilewidth, tileheight),
      parallaxOrigin: new Vector(parallaxoriginx, parallaxoriginy),
      properties: properties || [],
      hexsidelength,
      staggeraxis,
      staggerindex,
      orientation,
    }),
  ),
);

export const TiledMapSchema = v.union([
  OrthogonalMapSchema,
  IsometricMapSchema,
  StaggeredMapSchema,
  HexagonalMapSchema,
]);

export type TiledMap = v.InferOutput<typeof TiledMapSchema>;
