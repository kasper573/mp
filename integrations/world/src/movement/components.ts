import { array, enumOf, f32, object, optional } from "@rift/types";
import type { Tile } from "@mp/std";

export const TileVector = object({
  x: f32<Tile>(),
  y: f32<Tile>(),
});

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
  path: array(TileVector),
  moveTarget: optional(TileVector),
});

export const movementComponents = [Movement] as const;
