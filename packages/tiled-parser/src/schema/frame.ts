import type { TypeOf } from "@mp/schema";
import { object } from "@mp/schema";
import { localTileID, milliseconds } from "./common";

export type Frame = TypeOf<typeof frame>;
export const frame = object({
  duration: milliseconds,
  tileid: localTileID,
});
