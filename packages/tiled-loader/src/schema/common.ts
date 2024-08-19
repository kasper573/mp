export type Branded<T, Brand> = T & { __brand: Brand };

// Primitives
export type RGB = Branded<string, "RGB">;

export type ARGB = Branded<string, "ARGB">;

export type Color = RGB | ARGB;

// Units
export type TileNumber = Branded<number, "TileNumber">;

export type Pixel = Branded<number, "Pixel">;

/**
 * 0-1
 */
export type Ratio = Branded<number, "Ratio">;

export type Milliseconds = Branded<number, "Milliseconds">;

export type Degrees = Branded<number, "Degrees">;

export interface Coord {
  x: Pixel;
  y: Pixel;
}

// Semantics
export type GlobalTileId = Branded<number, "GlobalTileId">;

export type LocalTileId = Branded<number, "LocalTileId">;

export type TiledClass = Branded<string, "TiledClass">;

export type FilePath = Branded<string, "FilePath">;

// Complex

/**
 * array(integer): Uint8Array
 * string: encoded and compressed Uint8Array
 * (The encoding and compression should be defined alongside the data field)
 */
export type TiledData = number[] | string;

/**
 * -1 = use algorithm default
 * Otherwise it's a specific value to be given to the algorithm
 */
export type CompressionLevel = number;

// Enums
export type Orientation =
  | "orthogonal"
  | "isometric"
  | "staggered"
  | "hexagonal";

export type Compression = "zlib" | "gzip" | "zstd" | "";

export type Encoding = "csv" | "base64";

/**
 * Incremental ID, unique across all objects
 */
export type ObjectId = Branded<number, "ObjectId">;

/**
 * Incremental ID, unique across all layers
 */
export type LayerId = Branded<number, "LayerId">;

export type MapRenderOrder =
  | "right-down"
  | "right-up"
  | "left-down"
  | "left-up";

export type StaggerAxis = "x" | "y";

export type StaggerIndex = "odd" | "even";

export type FillMode = "stretch" | "preserve-aspect-fit";

export type ObjectAlignment =
  | "unspecified"
  | "topleft"
  | "top"
  | "topright"
  | "left"
  | "center"
  | "right"
  | "bottomleft"
  | "bottom"
  | "bottomright";

export type TileRenderSize = "tile" | "grid";

export type LayerDrawOrder = "topdown" | "index";

export type WangColorIndex = Branded<number, "WangColorIndex">;
