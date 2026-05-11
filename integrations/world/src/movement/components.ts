import { array, enumOf, f32, object, optional, u32 } from "@rift/types";
import type { Tile } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import { TileVector } from "../primitives";

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
  desiredPortalId: optional(u32<ObjectId>()),
});

// Server-only: pathfinding state for entities that are being moved along
// a precomputed route. Read by AI/combat to clear pathing on combat
// transitions; written by the movement system. Not replicated.
export const PathFollow = object({
  path: array(TileVector),
});

export const movementComponents = [Movement] as const;
