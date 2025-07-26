import type { LocalTileId, TiledClass, WangColorIndex } from "./common";
import type { PropertyMap } from "./property";

export interface WangColor {
  class?: TiledClass;
  color: string;
  name: string;
  probability: number;
  properties: PropertyMap;
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
  properties: PropertyMap;
  tile: LocalTileId;
  type: "corner" | "edge" | "mixed";
  wangtiles: WangTile[];
}
