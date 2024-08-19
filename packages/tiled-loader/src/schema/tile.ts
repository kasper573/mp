import {
  array,
  float,
  lazy,
  object,
  optional,
  string,
  tuple,
  fallback,
} from "@mp/schema";
import type { LoaderContext } from "../context";
import type { ImageFile, LocalTileId, PixelUnit } from "./common";
import { image, index, localTileID, pixelUnit } from "./common";
import type { ObjectGroupLayer } from "./layer";
import { objectGroupLayer } from "./layer";
import type { Property } from "./property";
import { property } from "./property";
import type { Frame } from "./frame";
import { frame } from "./frame";

export interface Tile {
  animation?: Frame[];
  id: LocalTileId;

  // Used for image collection tilesets
  image?: ImageFile;
  imageheight?: PixelUnit;
  imagewidth?: PixelUnit;

  // The bounds of the sub-rectangle representing this tile
  // (width/height defaults to image width/height)
  x: PixelUnit;
  y: PixelUnit;
  width?: PixelUnit;
  height?: PixelUnit;

  objectgroup?: ObjectGroupLayer;
  probability?: number;
  properties?: Property[];
  terrain?: [number, number, number, number];
  type?: string;
}

export function tile(context: LoaderContext) {
  return object({
    animation: optional(array(frame)),
    id: localTileID,

    image: optional(image(context)),
    imageheight: optional(pixelUnit),
    imagewidth: optional(pixelUnit),

    x: fallback(pixelUnit, 0),
    y: fallback(pixelUnit, 0),
    width: optional(pixelUnit),
    height: optional(pixelUnit),

    /**
     * Set when collision shapes are specified
     */
    objectgroup: lazy(() => optional(objectGroupLayer(context))),

    /**
     * Percentage chance this tile is chosen when competing with others in the editor
     */
    probability: optional(float),

    properties: optional(array(property(context))),

    /**
     * Index of terrain for each corner of tile
     */
    terrain: optional(tuple([index, index, index, index])),
    type: optional(string),
  });
}

export function createEmptyTile(id: LocalTileId): Tile {
  return {
    id,
    x: 0,
    y: 0,
  };
}
