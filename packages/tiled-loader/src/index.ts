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

// Original map types
export type {
  SharedMapProperties,
  OrthogonalMap,
  IsometricMap,
  StaggeredMap,
  HexagonalMap,
  TiledMap,
} from "./schema/map";

// New Vector-based types and schemas
export type * from "./schema/vector-types";
export type * from "./schema/vector-objects";
export type { VectorTiledMap } from "./schema/vector-map";

export * from "./schema/common";
export * from "./loader";
export * from "./gid";

// New Vector-based loader
export * from "./vector-loader";
