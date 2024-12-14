import type { GlobalIdFlags } from "../gid.ts";
import type {
  Color,
  FilePath,
  GlobalTileId,
  LayerDrawOrder,
  LayerId,
  Pixel,
  Ratio,
  RGB,
  TiledClass,
  TileNumber,
} from "./common.ts";

import type { PropertyMap } from "./property.ts";
import type { TiledObject } from "./object.ts";
import type { Tileset, TilesetTile } from "./tileset.ts";

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
  x: TileNumber;

  /**
   * Vertical layer offset in tiles. Always 0.
   */
  y: TileNumber;
}

export interface CommonTileLayerProperties {
  type: "tilelayer";
  /**
   * Row count. Same as map height for fixed-size maps.
   */
  height: TileNumber;

  /**
   * Column count. Same as map width for fixed-size maps.
   */
  width: TileNumber;
}

export interface TileLayer
  extends SharedLayerProperties, CommonTileLayerProperties {
  tiles: TileLayerTile[];
}

export interface TileLayerTile {
  id: GlobalTileId;
  x: TileNumber;
  y: TileNumber;
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
  transparentcolor?: RGB;
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
