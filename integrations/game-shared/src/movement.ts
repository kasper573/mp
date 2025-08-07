import type { CardinalDirection, Path, Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { object, prop } from "@mp/sync";
import type { ObjectId } from "@mp/tiled-loader";
import * as patchOptimizers from "./patch-optimizers";

export const MovementTrait = object({
  /**
   * Current position of the subject.
   */
  coords: prop<Vector<Tile>>(patchOptimizers.coords),
  speed: prop<Tile>(),
  /**
   * A desired target. Will be consumed by the movement behavior to find a new path.
   */
  moveTarget: prop<Vector<Tile> | undefined>(),
  /**
   * Has to be explicitly set by the client for portal traversal to be able to happen.
   * This avoids unintended portal traversal by actors that are not supposed to use portals.
   * The movement behavior will continuously check if the actor has reached this portal.
   */
  desiredPortalId: prop<ObjectId | undefined>(),
  /**
   * The current path the subject is following.
   */
  path: prop<Path<Tile> | undefined>(patchOptimizers.path),
  /**
   * The direction the subject is facing.
   */
  dir: prop<CardinalDirection>(),
});

export type MovementTrait = typeof MovementTrait.$infer;
