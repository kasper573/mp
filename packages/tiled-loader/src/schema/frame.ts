import type { LocalTileId, Milliseconds } from "./common";

export interface Frame {
  duration: Milliseconds;
  tileid: LocalTileId;
}
