import { array, object, string } from "@mp/schema";
import type { LoaderContext } from "../context";
import { localTileID } from "./common";
import type { Property } from "./property";
import { property } from "./property";

export interface Terrain {
  name: string;
  properties: Property[];
  tile: number;
}
export function terrain(context: LoaderContext) {
  return object({
    name: string,
    properties: array(property(context)),
    tile: localTileID,
  });
}
