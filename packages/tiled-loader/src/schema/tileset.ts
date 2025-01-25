import type {
  GlobalTileId,
  LocalTileId,
  ObjectAlignment,
  Pixel,
  Coord,
  RGB,
  TiledClass,
  TileRenderSize,
  TileNumber,
  FilePath,
} from "./common";
import type { WangSet } from "./wang";
import type { Transformations } from "./transformations";
import type { Grid } from "./grid";
import type { Property, PropertyMap } from "./property";
import type { Terrain } from "./terrain";
import type { Frame } from "./frame";
import type { ObjectGroupLayer } from "./layer";

export interface Tileset {
  backgroundcolor?: string;
  class?: TiledClass;
  columns: TileNumber;
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
  tilecount: TileNumber;

  /**
   * The Tiled version used to save the file
   */
  tiledversion: string;

  /**
   * Maximum height of tiles in this set
   */
  tileheight?: TileNumber;

  /**
   * Maximum width of tiles in this set
   */
  tilewidth?: TileNumber;

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
