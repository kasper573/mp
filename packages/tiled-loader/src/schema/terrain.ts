import type { TypeOf } from "@mp/schema";
import { array, object, string } from "@mp/schema";
import type { LoaderContext } from "../context";
import { localTileID } from "./common";
import { property } from "./property";

export type Terrain = TypeOf<ReturnType<typeof terrain>>;
export function terrain(context: LoaderContext) {
  return object({
    name: string,
    properties: array(property(context)),
    tile: localTileID,
  });
}
