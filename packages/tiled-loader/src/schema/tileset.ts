import type { Pixel, Tile } from "@mp/std";
import type {
  Coord,
  FilePath,
  GlobalTileId,
  LocalTileId,
  ObjectAlignment,
  RGB,
  TiledClass,
  TileRenderSize,
} from "./common.ts";
import type { WangSet } from "./wang.ts";
import type { Transformations } from "./transformations.ts";
import type { Grid } from "./grid.ts";
import type { Property, PropertyMap } from "./property.ts";
import type { Terrain } from "./terrain.ts";
import type { Frame } from "./frame.ts";
import type { ObjectGroupLayer } from "./layer.ts";

export interface Tileset {
  backgroundcolor?: string;
  class?: TiledClass;
  columns: Tile;
  fillmode: string;
  firstgid: GlobalTileId;
  grid?: Grid;

  image: FilePath;
  imageheight: Pixel;
  imagewidth: Pixel;

  /**
   * Buffer between image edge and first tile (pixels)
   */
  margin: Pixel;

  name: string;
  objectalignment: ObjectAlignment;
  properties: PropertyMap;

  /**
   * Spacing between adjacent tiles in image (pixels)
   */
  spacing: Pixel;
  terrains?: Terrain[];

  /**
   * The number of tiles in this tileset
   */
  tilecount: Tile;

  /**
   * The Tiled version used to save the file
   */
  tiledversion: string;

  /**
   * Maximum height of tiles in this set
   */
  tileheight?: Tile;

  /**
   * Maximum width of tiles in this set
   */
  tilewidth?: Tile;

  tileoffset?: Coord;
  tilerendersize: TileRenderSize;

  tiles: Map<LocalTileId, TilesetTile>;

  /**
   * Allowed transformations
   */
  transformations?: Transformations;

  transparentcolor?: RGB;

  /**
   * The JSON format version
   */
  version?: string;

  wangsets?: WangSet[];
}

export interface TilesetTile {
  animation?: Frame[];
  id: LocalTileId;

  // Used for image collection tilesets
  image?: FilePath;
  imageheight?: Pixel;
  imagewidth?: Pixel;

  // The bounds of the sub-rectangle representing this tile
  // (width/height defaults to image width/height)
  x?: Pixel;
  y?: Pixel;
  width?: Pixel;
  height?: Pixel;

  objectgroup?: ObjectGroupLayer;
  probability?: number;
  properties: Map<string, Property>;
  terrain?: [number, number, number, number];
  type?: TiledClass;
}
