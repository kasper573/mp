import type { WritableKeysOf, Simplify } from "type-fest";
import { type } from "@mp/validate";

// Matches the structure of the `Brand` type from arktype,
// to make our branded types compatible with arktype's.
const brand = " brand" as const;
export type Branded<T, Name extends string> = T & {
  readonly [brand]: [T, Name];
};

/**
 * Unit of measurement in 2D screen space.
 */
export const PixelType = type("number").brand("Pixel");
export type Pixel = typeof PixelType.infer;

/**
 * Unit of measurement in 2D tile space.
 */
export const TileType = type("number").brand("Tile");
export type Tile = typeof TileType.infer;

export const LocalFileType = type("string").brand("LocalFile");
export type LocalFile = typeof LocalFileType.infer;

export type UrlString = string;

export const TimesPerSecondType = type("number").brand("TimesPerSecond");
export type TimesPerSecond = typeof TimesPerSecondType.infer;

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
