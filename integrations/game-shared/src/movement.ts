import type { CardinalDirection, Path, Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { tracked } from "@mp/sync";
import type { ObjectId } from "@mp/tiled-loader";
import { EncoderTag } from "./encoding";
import * as patchOptimizers from "./patch-optimizers";

@tracked(EncoderTag.MovementTrait, {
  optimizers: patchOptimizers,
})
export class MovementTrait {
  /**
   * Current position of the subject.
   */
  coords!: Vector<Tile>;
  speed!: Tile;
  /**
   * A desired target. Will be consumed by the movement behavior to find a new path.
   */
  moveTarget?: Vector<Tile>;
  /**
   * Has to be explicitly set by the client for portal traversal to be able to happen.
   * This avoids unintended portal traversal by actors that are not supposed to use portals.
   * The movement behavior will continuously check if the actor has reached this portal.
   */
  desiredPortalId?: ObjectId;
  /**
   * The current path the subject is following.
   */
  path?: Path<Tile>;
  /**
   * The direction the subject is facing.
   */
  dir!: CardinalDirection;
}
