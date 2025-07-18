export type * from "./schema/chunk";
export type * from "./schema/frame";
export type * from "./schema/grid";
export type * from "./schema/layer";
export type * from "./schema/object";
export type * from "./schema/property";
export type * from "./schema/terrain";
export type * from "./schema/text";
export type * from "./schema/tileset";
export type * from "./schema/transformations";
export type * from "./schema/wang";

// Vector-based types and schemas (primary interface)
export type * from "./schema/vector-types";
export type * from "./schema/vector-objects";
export type { VectorTiledMap } from "./schema/vector-map";

// Vector helper functions
export {
  createPosition,
  createSize,
  createTilePosition,
  createTileSize,
} from "./schema/vector-types";

// Vector-based loader (primary loader)
export * from "./vector-loader";

// Legacy map types (for compatibility)
export type {
  SharedMapProperties,
  OrthogonalMap,
  IsometricMap,
  StaggeredMap,
  HexagonalMap,
  TiledMap,
} from "./schema/map";

export * from "./schema/common";
export * from "./gid";
