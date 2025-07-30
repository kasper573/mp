import type { CardinalDirection, Path, Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { defineSyncComponent } from "@mp/sync";
import type { ObjectId } from "@mp/tiled-loader";
import * as patchOptimizers from "./patch-optimizers";

export type MovementTrait = typeof MovementTrait.$infer;

export const MovementTrait = defineSyncComponent((builder) =>
  builder
    /**
     * Current position of the subject.
     */
    .add<Vector<Tile>>(patchOptimizers.coords)("coords")
    .add<Tile>()("speed")
    /**
     * A desired target. Will be consumed by the movement behavior to find a new path.
     */
    .add<Vector<Tile> | undefined>()("moveTarget")
    /**
     * Has to be explicitly set by the client for portal traversal to be able to happen.
     * This avoids unintended portal traversal by actors that are not supposed to use portals.
     * The movement behavior will continuously check if the actor has reached this portal.
     */
    .add<ObjectId | undefined>()("desiredPortalId")
    /**
     * The current path the subject is following.
     */
    .add<Path<Tile> | undefined>(patchOptimizers.path)("path")
    /**
     * The direction the subject is facing.
     */
    .add<CardinalDirection>()("dir"),
);
