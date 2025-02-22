import type { Pixel, Tile } from "@mp/std";
import type {
  Color,
  CompressionLevel,
  LayerId,
  MapRenderOrder,
  ObjectId,
  StaggerAxis,
  StaggerIndex,
  TiledClass,
} from "./common.ts";
import type { Layer } from "./layer.ts";
import type { PropertyMap } from "./property.ts";
import type { Tileset } from "./tileset.ts";

export interface SharedMapProperties {
  type: "map";
  version: string;
  tiledversion: string;

  tilesets: Tileset[];
  properties: PropertyMap;
  layers: Layer[];

  backgroundcolor?: Color;
  class?: TiledClass;

  height: Tile;
  width: Tile;
  tileheight: Pixel;
  tilewidth: Pixel;

  parallaxoriginx: Pixel;
  parallaxoriginy: Pixel;

  /**
   * Whether the map has infinite dimensions
   */
  infinite: boolean;

  /**
   * The compression level to use for tile layer data
   */
  compressionlevel: CompressionLevel;

  /**
   * Auto-increments for each layer
   */
  nextlayerid: LayerId;

  /**
   * Auto-increments for each placed object
   */
  nextobjectid: ObjectId;
}

export interface OrthogonalMap extends SharedMapProperties {
  renderorder: MapRenderOrder;
  orientation: "orthogonal";
}

export interface IsometricMap extends SharedMapProperties {
  orientation: "isometric";
}

export interface StaggeredMap extends SharedMapProperties {
  staggeraxis: StaggerAxis;
  staggerindex: StaggerIndex;
  orientation: "staggered";
}

export interface HexagonalMap extends SharedMapProperties {
  hexsidelength: Pixel;
  staggeraxis: StaggerAxis;
  staggerindex: StaggerIndex;
  orientation: "hexagonal";
}

export type TiledMap =
  | OrthogonalMap
  | IsometricMap
  | StaggeredMap
  | HexagonalMap;
