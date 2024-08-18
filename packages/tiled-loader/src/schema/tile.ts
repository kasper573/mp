import type { TypeOf } from "@mp/schema";
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
import { image, index, localTileID, pixelUnit } from "./common";
import { objectGroupLayer } from "./layer";
import { property } from "./property";
import { frame } from "./frame";

export type Tile = TypeOf<ReturnType<typeof tile>>;
export function tile(context: LoaderContext) {
  return object({
    animation: optional(array(frame)),
    id: localTileID,
    /**
     * Used for image collection tilesets
     */
    image: optional(image(context)),
    imageheight: optional(pixelUnit),
    imagewidth: optional(pixelUnit),

    // The bounds of the sub-rectangle representing this tile (width/height defaults to image width/height)
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
