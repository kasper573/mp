export type * from "./schema/chunk";
export type * from "./schema/frame";
export type * from "./schema/grid";
export type * from "./schema/layer";
export type * from "./schema/map";
export type * from "./schema/object";
export type * from "./schema/property";
export type * from "./schema/terrain";
export type * from "./schema/text";
export type * from "./schema/tileset";
export type * from "./schema/transformations";
export type * from "./schema/wang";

export * from "./traversal";
export * from "./schema/common";
export * from "./gid";

// Keep the original loader as the default for backward compatibility
export * from "./loader";

// Export the new Vector-based loader as an additional option
export * from "./vector-loader";
