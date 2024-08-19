import type {
  Color,
  CompressionLevel,
  LayerId,
  MapRenderOrder,
  ObjectId,
  Pixel,
  StaggerAxis,
  StaggerIndex,
  TiledClass,
  TileNumber,
} from "./common";
import type { Layer } from "./layer";
import type { Property } from "./property";
import type { Tileset } from "./tileset";

export interface SharedMapProperties {
  type: "map";
  version: string;
  tiledversion: string;

  tilesets: Tileset[];
  properties?: Property[];
  layers: Layer[];

  backgroundcolor?: Color;
  class?: TiledClass;

  height: TileNumber;
  width: TileNumber;
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
