import type { LocalTileId, Milliseconds } from "./common.ts";

export interface Frame {
  duration: Milliseconds;
  tileid: LocalTileId;
}
