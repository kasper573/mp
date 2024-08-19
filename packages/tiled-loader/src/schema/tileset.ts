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
import type { Tile } from "./tile";
import type { Transformations } from "./transformations";
import type { Grid } from "./grid";
import type { Property } from "./property";
import type { Terrain } from "./terrain";

export interface Tileset {
  backgroundcolor?: string;
  class?: TiledClass;
  columns: TileNumber;
  fillmode: FillMode;
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
  properties?: Property[];

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

  tiles: Map<LocalTileId, Tile>;

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
