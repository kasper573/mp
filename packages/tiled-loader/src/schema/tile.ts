import type { FilePath, LocalTileId, Pixel } from "./common";
import type { ObjectGroupLayer } from "./layer";
import type { Property } from "./property";
import type { Frame } from "./frame";

export interface Tile {
  animation?: Frame[];
  id: LocalTileId;

  // Used for image collection tilesets
  image?: FilePath;
  imageheight?: Pixel;
  imagewidth?: Pixel;

  // The bounds of the sub-rectangle representing this tile
  // (width/height defaults to image width/height)
  x: Pixel;
  y: Pixel;
  width?: Pixel;
  height?: Pixel;

  objectgroup?: ObjectGroupLayer;
  probability?: number;
  properties?: Property[];
  terrain?: [number, number, number, number];
  type?: string;
}
