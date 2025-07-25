import type { Vector, VectorLike } from "@mp/math";
import type { CardinalDirection, Path } from "@mp/math";
import type { TickEventHandler } from "@mp/time";
import type { Tile } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import type { GameState } from "../game-state/game-state";

import type { AreaId } from "../area/area-id";
import { moveAlongPath } from "../area/move-along-path";

import type { AreaResource } from "../area/area-resource";
import { getAreaIdFromObject } from "../area/area-resource";
import { defineSyncComponent } from "@mp/sync";
import * as patchOptimizers from "../network/patch-optimizers";
import type { Character } from "../character/types";

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

export function movementBehavior(
  state: GameState,
  area: AreaResource,
): TickEventHandler {
  return function movementBehaviorTick({ timeSinceLastTick }) {
    for (const actor of state.actors.values()) {
      // The dead don't move
      if (actor.combat.health <= 0) {
        actor.movement.path = undefined;
        actor.movement.moveTarget = undefined;
        continue;
      }

      // Consume the move target and produce a new path to move along
      if (actor.movement.moveTarget) {
        actor.movement.path = findPathForSubject(
          actor.movement,
          area,
          actor.movement.moveTarget,
        );
        actor.movement.moveTarget = undefined;
      }

      moveAlongPath(actor.movement, timeSinceLastTick);

      // Process portals
      for (const object of area.hitTestObjects(
        area.tiled.tileCoordToWorld(actor.movement.coords),
      )) {
        const destinationAreaId = getAreaIdFromObject(object) as
          | AreaId
          | undefined;
        if (
          destinationAreaId &&
          actor.type === "character" &&
          actor.movement.desiredPortalId === object.id
        ) {
          sendCharacterToArea(actor, area, destinationAreaId);
        }
      }
    }
  };
}

/**
 * Actors area ids are only stored in the database.
 * What controls which area an actor is associated with at runtime is simply if it's been added to a game server instance.
 * Each game server instance only houses one specific area, so adding an actor to a game server instance is equal to adding it to that area.
 */
export function sendCharacterToArea(
  char: Character,
  currentArea: AreaResource,
  destinationAreaId: AreaId,
  coords?: Vector<Tile>,
) {
  char.movement.path = undefined;
  char.movement.desiredPortalId = undefined;
  if (destinationAreaId === currentArea.id) {
    // If we're portalling within the same area we can just change coords
    char.movement.coords = coords ?? currentArea.start;
  } else {
    // But to change to a different area we must handle sharding,
    // which requires more intricate handling.
    // TODO implement
    throw new Error(
      "Sending character to a different area is not implemented yet.",
    );
  }
}

export function findPathForSubject(
  subject: MovementTrait,
  area: AreaResource,
  dest: VectorLike<Tile>,
): Path<Tile> | undefined {
  const fromNode = area.graph.getProximityNode(subject.coords);
  if (!fromNode) {
    return;
  }
  const destNode = area.graph.getProximityNode(dest);
  if (!destNode) {
    return;
  }
  return area.graph.findPath(fromNode, destNode);
}
