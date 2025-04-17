import type { Pixel, Tile } from "@mp/std";
import type { GlobalIdFlags } from "../gid";
import type {
  Color,
  LayerId,
  Ratio,
  Rgb,
  TiledClass,
  LayerDrawOrder,
  FilePath,
  GlobalTileId,
} from "./common";

import type { PropertyMap } from "./property";
import type { TiledObject } from "./object";
import type { Tileset, TilesetTile } from "./tileset";

export interface SharedLayerProperties {
  class?: TiledClass;
  id: LayerId;
  locked: boolean;
  name: string;
  offsetx: Pixel;
  offsety: Pixel;
  opacity: Ratio;
  parallaxx: Ratio;
  parallaxy: Ratio;
  properties: PropertyMap;
  visible: boolean;

  // coordinate where layer content starts (for infinite maps)
  startx?: Pixel;
  starty?: Pixel;

  /**
   * multiplied with any graphics drawn by this layer or any child layers
   */
  tintcolor?: Color;

  /**
   * Horizontal layer offset in tiles. Always 0.
   */
  x: Tile;

  /**
   * Vertical layer offset in tiles. Always 0.
   */
  y: Tile;
}

export interface CommonTileLayerProperties {
  type: "tilelayer";
  /**
   * Row count. Same as map height for fixed-size maps.
   */
  height: Tile;

  /**
   * Column count. Same as map width for fixed-size maps.
   */
  width: Tile;
}

export interface TileLayer
  extends SharedLayerProperties,
    CommonTileLayerProperties {
  tiles: TileLayerTile[];
}

export interface TileLayerTile {
  id: GlobalTileId;
  x: Tile;
  y: Tile;
  width: Pixel;
  height: Pixel;
  tileset: Tileset;
  tile: TilesetTile;
  flags: GlobalIdFlags;
}

export interface ImageLayer extends SharedLayerProperties {
  type: "imagelayer";
  image: FilePath;
  repeatx: boolean;
  repeaty: boolean;
  transparentcolor?: Rgb;
}

export interface ObjectGroupLayer extends SharedLayerProperties {
  type: "objectgroup";
  draworder: LayerDrawOrder;
  objects: TiledObject[];
}

export interface GroupLayer extends SharedLayerProperties {
  type: "group";
  layers: Layer[];
}

export type Layer = GroupLayer | TileLayer | ImageLayer | ObjectGroupLayer;
