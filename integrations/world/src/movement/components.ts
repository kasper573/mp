import { enumOf, f32, object, optional, transform } from "@rift/types";
import type { Tile } from "@mp/std";
import { Vector } from "@mp/math";

export const TileVector = transform(
  object({
    x: f32<Tile>(),
    y: f32<Tile>(),
  }),
  ({ x, y }) => new Vector(x, y),
  (v) => ({ x: v.x, y: v.y }),
);

export const cardinalDirections = [
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
  "n",
  "ne",
] as const;

export type CardinalDirection = (typeof cardinalDirections)[number];

export const Direction = enumOf(...cardinalDirections);

export const Movement = object({
  coords: TileVector,
  speed: f32<Tile>(),
  direction: Direction,
  moveTarget: optional(TileVector),
});

export const movementComponents = [Movement] as const;
