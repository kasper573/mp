import type {
  Color,
  Encoding,
  LayerId,
  Pixel,
  Ratio,
  RGB,
  TiledClass,
  TiledData,
  TileNumber,
  Compression,
  LayerDrawOrder,
  FilePath,
} from "./common";

import type { Property } from "./property";
import type { TiledObject } from "./object";
import { type Chunk } from "./chunk";

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
  properties?: Property[];
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

export interface TileLayer extends SharedLayerProperties {
  type: "tilelayer";
  chunks?: Chunk[];
  compression: Compression;
  data: TiledData;
  encoding: Encoding;

  /**
   * Row count. Same as map height for fixed-size maps.
   */
  height: TileNumber;

  /**
   * Column count. Same as map width for fixed-size maps.
   */
  width: TileNumber;
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
