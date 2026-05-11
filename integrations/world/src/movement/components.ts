import { array, enumOf, f32, object, optional, transform } from "@rift/types";
import type { Tile } from "@mp/std";
import { Vector } from "@mp/math";
import type { ObjectId } from "@mp/tiled-loader";

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

export const MoveToPortal = object({
  portalId: f32<ObjectId>(),
  movement: Movement,
});

// Server-only: pathfinding state for entities that are being moved along
// a precomputed route. Read by AI/combat to clear pathing on combat
// transitions; written by the movement system. Not replicated.
export const PathFollow = object({
  path: array(TileVector),
});

export const movementComponents = [Movement] as const;
