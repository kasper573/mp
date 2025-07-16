import * as v from "valibot";
import {
  MapTileSizeSchema,
  TileSizeSchema,
  PositionSchema,
  type TileSize,
  type Size,
  type Position,
} from "./vector-types";
import type {
  Color,
  CompressionLevel,
  LayerId,
  MapRenderOrder,
  StaggerAxis,
  StaggerIndex,
  TiledClass,
} from "./common";
import type { Layer } from "./layer";
import type { PropertyMap } from "./property";
import type { Tileset } from "./tileset";

/**
 * Vector-based map interface (transformed from Tiled JSON)
 */
export interface VectorTiledMap {
  type: "map";
  version: string;
  tiledversion: string;

  // Vector-based properties
  mapSize: TileSize; // Replaces width/height with Vector<Tile>
  tileSize: Size; // Replaces tilewidth/tileheight with Vector<Pixel>
  parallaxOrigin?: Position; // Replaces parallaxoriginx/parallaxoriginy with Vector<Pixel>

  // Existing properties
  tilesets: Tileset[];
  properties: PropertyMap;
  layers: Layer[]; // TODO: Transform layers to use Vector types

  backgroundcolor?: Color;
  class?: TiledClass;

  // Map configuration
  infinite: boolean;
  orientation: "orthogonal" | "isometric" | "staggered" | "hexagonal";
  renderorder: MapRenderOrder;
  compressionlevel: CompressionLevel;

  // Staggered/Hexagonal map properties
  staggeraxis?: StaggerAxis;
  staggerindex?: StaggerIndex;
  hexsidelength?: number;

  // Layer management
  nextlayerid: LayerId;
  nextobjectid: number;
}

/**
 * Valibot schema for parsing Tiled JSON map and transforming to Vector types
 */
export const VectorTiledMapSchema = v.pipe(
  v.object({
    type: v.literal("map"),
    version: v.string(),
    tiledversion: v.string(),

    // Dimensions (to be transformed to Vector types)
    width: v.number(),
    height: v.number(),
    tilewidth: v.number(),
    tileheight: v.number(),

    // Optional parallax origin (to be transformed to Vector)
    parallaxoriginx: v.optional(v.number()),
    parallaxoriginy: v.optional(v.number()),

    // Arrays
    tilesets: v.array(v.any()), // TODO: Use tileset schema
    properties: v.optional(v.array(v.any()), []), // TODO: Transform properties
    layers: v.array(v.any()), // TODO: Transform layers

    // Optional properties
    backgroundcolor: v.optional(v.string()),
    class: v.optional(v.string()),

    // Map configuration
    infinite: v.boolean(),
    orientation: v.picklist([
      "orthogonal",
      "isometric",
      "staggered",
      "hexagonal",
    ]),
    renderorder: v.string(), // TODO: Use proper enum
    compressionlevel: v.number(),

    // Optional staggered/hexagonal properties
    staggeraxis: v.optional(v.string()),
    staggerindex: v.optional(v.string()),
    hexsidelength: v.optional(v.number()),

    // Layer management
    nextlayerid: v.number(),
    nextobjectid: v.number(),
  }),
  v.transform(
    ({
      width,
      height,
      tilewidth,
      tileheight,
      parallaxoriginx,
      parallaxoriginy,
      backgroundcolor,
      class: tiledClass,
      renderorder,
      compressionlevel,
      staggeraxis,
      staggerindex,
      nextlayerid,
      properties: _properties,
      ...rest
    }): VectorTiledMap => ({
      ...rest,
      mapSize: v.parse(MapTileSizeSchema, { width, height }),
      tileSize: v.parse(TileSizeSchema, { tilewidth, tileheight }),
      parallaxOrigin:
        parallaxoriginx !== undefined && parallaxoriginy !== undefined
          ? v.parse(PositionSchema, { x: parallaxoriginx, y: parallaxoriginy })
          : undefined,

      backgroundcolor: backgroundcolor as Color | undefined,
      class: tiledClass as TiledClass | undefined,
      renderorder: renderorder as MapRenderOrder,
      compressionlevel: compressionlevel as CompressionLevel,
      staggeraxis: staggeraxis as StaggerAxis | undefined,
      staggerindex: staggerindex as StaggerIndex | undefined,
      nextlayerid: nextlayerid as LayerId,
      properties: {} as PropertyMap, // TODO: Transform properties
    }),
  ),
);

/**
 * Backward compatible map interface with deprecation warnings
 * @deprecated Use VectorTiledMap instead
 */
export interface TiledMap
  extends Omit<VectorTiledMap, "mapSize" | "tileSize" | "parallaxOrigin"> {
  /** @deprecated Use mapSize.x instead */
  width: number;
  /** @deprecated Use mapSize.y instead */
  height: number;
  /** @deprecated Use tileSize.x instead */
  tilewidth: number;
  /** @deprecated Use tileSize.y instead */
  tileheight: number;
  /** @deprecated Use parallaxOrigin?.x instead */
  parallaxoriginx?: number;
  /** @deprecated Use parallaxOrigin?.y instead */
  parallaxoriginy?: number;
}
