import type { TypeOf } from "@mp/schema";
import { array, object, string } from "@mp/schema";
import { localTileID } from "./common";
import { property } from "./property";

export type Terrain = TypeOf<typeof terrain>;
export const terrain = object({
  name: string,
  properties: array(property),
  tile: localTileID,
});
