import { object } from "@mp/schema";
import type { LocalTileId, Milliseconds } from "./common";
import { localTileID, milliseconds } from "./common";

export const frame = object({
  duration: milliseconds,
  tileid: localTileID,
});

export interface Frame {
  duration: Milliseconds;
  tileid: LocalTileId;
}
