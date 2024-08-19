import type { LocalTileId, TiledClass, WangColorIndex } from "./common";
import type { Property } from "./property";

export interface WangColor {
  class?: TiledClass;
  color: string;
  name: string;
  probability: number;
  properties?: Property[];
  tile: LocalTileId;
}

export interface WangTile {
  tileid: LocalTileId;
  wangid: [
    WangColorIndex,
    WangColorIndex,
    WangColorIndex,
    WangColorIndex,
    WangColorIndex,
    WangColorIndex,
    WangColorIndex,
    WangColorIndex,
  ];
}

export interface WangSet {
  class?: TiledClass;
  colors?: Record<WangColorIndex, WangColor>;
  name: string;
  properties?: Property[];
  tile: LocalTileId;
  type: "corner" | "edge" | "mixed";
  wangtiles: WangTile[];
}
