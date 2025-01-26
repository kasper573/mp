export type Branded<T, Name extends string> = T & { __brand__: Name };

export type Pixel = Branded<number, "Pixel">;

export type TileNumber = Branded<number, "TileNumber">;
