import type { WritableKeysOf, Simplify } from "type-fest";

// Matches the structure of the `Brand` type from arktype,
// to make our branded types compatible with arktype's.
const brand = " brand" as const;
export type Branded<T, Name extends string> = T & {
  readonly [brand]: [T, Name];
};

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

export type MinimalInput<T> = TreatUndefinedAsOptional<WritableSubset<T>>;

export type WritableSubset<T> = {
  [K in WritableKeysOf<T>]: T[K];
};

export type TreatUndefinedAsOptional<T> = Simplify<
  Partial<Pick<T, UndefinedKeys<T>>> & Pick<T, DefinedKeys<T>>
>;

type UndefinedKeys<T> = RerverseConditionalKeys<T, undefined>;
type DefinedKeys<T> = Exclude<keyof T, UndefinedKeys<T>>;

type RerverseConditionalKeys<Base, Condition> = {
  [K in keyof Base]: Condition extends Base[K] ? K : never;
}[keyof Base];
