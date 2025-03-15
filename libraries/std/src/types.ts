export type Branded<T, Name extends string> = T & { __brand__: Name };

/**
 * Unit of measurement in 2D screen space.
 */
export type Pixel = Branded<number, "Pixel">;

/**
 * Unit of measurement in 2D tile space.
 */
export type Tile = Branded<number, "Tile">;

export type LocalFile = Branded<string, "LocalFile">;

export type PublicUrl = Branded<string, "PublicUrl">;

export type TimesPerSecond = Branded<number, "TimesPerSecond">;
