export type Branded<T, Name extends string> = T & { __brand__: Name };

/**
 * Unit of measurement in 2D screen space.
 */
export type Pixel = Branded<number, "Pixel">;

/**
 * Unit of measurement in 2D tile space.
 */
export type Tile = Branded<number, "Tile">;
