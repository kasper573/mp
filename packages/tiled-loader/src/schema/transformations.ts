import { boolean, object } from "@mp/schema";

export interface Transformations {
  /**
   * Tiles can be flipped horizontally
   */
  hflip: boolean;

  /**
   * Tiles can be flipped vertically
   */
  vflip: boolean;

  /**
   * Tiles can be rotated in 90-degree increments
   */
  rotate: boolean;

  /**
   * Whether untransformed tiles remain preferred, otherwise transformed tiles are used to produce more variations
   */
  preferuntransformed: boolean;
}

export const transformations = object({
  hflip: boolean,
  vflip: boolean,
  rotate: boolean,
  preferuntransformed: boolean,
});
