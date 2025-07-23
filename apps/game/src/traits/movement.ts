import type { Vector, VectorLike } from "@mp/math";
import type { CardinalDirection, Path } from "@mp/math";
import type { TickEventHandler } from "@mp/time";
import { assert, type Tile } from "@mp/std";
import type { ObjectId } from "@mp/tiled-loader";
import type { GameState } from "../game-state/game-state";
import type { AreaLookup } from "../area/lookup";
import type { AreaId } from "../area/area-id";
import { moveAlongPath } from "../area/move-along-path";

import { getAreaIdFromObject } from "../area/area-resource";
import { defineSyncComponent } from "@mp/sync";
import * as patchOptimizers from "../network/patch-optimizers";

export type MovementTrait = typeof MovementTrait.$infer;

export const MovementTrait = defineSyncComponent((builder) =>
  builder
    /**
     * Current position of the subject.
     */
    .add<"coords", Vector<Tile>>("coords", undefined, patchOptimizers.coords)
    .add<"speed", Tile>("speed")
    .add<"areaId", AreaId>("areaId")
    /**
     * A desired target. Will be consumed by the movement behavior to find a new path.
     */
    .add<"moveTarget", Vector<Tile> | undefined>("moveTarget", undefined)
    /**
     * Has to be explicitly set by the client for portal traversal to be able to happen.
     * This avoids unintended portal traversal by actors that are not supposed to use portals.
     * The movement behavior will continuously check if the actor has reached this portal.
     */
    .add<"desiredPortalId", ObjectId | undefined>("desiredPortalId", undefined)
    /**
     * The current path the subject is following.
     */
    .add<"path", Path<Tile> | undefined>(
      "path",
      undefined,
      patchOptimizers.path,
    )
    /**
     * The direction the subject is facing.
     */
    .add<"dir", CardinalDirection>("dir"),
);

export function movementBehavior(
  state: GameState,
  areas: AreaLookup,
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
          areas,
          actor.movement.moveTarget,
        );
        actor.movement.moveTarget = undefined;
      }

      moveAlongPath(actor.movement, timeSinceLastTick);

      // Process portals
      const area = assert(areas.get(actor.movement.areaId));
      for (const object of area.hitTestObjects(
        area.tiled.tileCoordToWorld(actor.movement.coords),
      )) {
        const destinationArea = areas.get(
          getAreaIdFromObject(object) as AreaId,
        );
        if (
          destinationArea &&
          actor.type === "character" &&
          actor.movement.desiredPortalId === object.id
        ) {
          actor.movement.path = undefined;
          actor.movement.desiredPortalId = undefined;
          actor.movement.areaId = destinationArea.id;
          actor.movement.coords = destinationArea.start;
        }
      }
    }
  };
}

export function findPathForSubject(
  subject: MovementTrait,
  areas: AreaLookup,
  dest: VectorLike<Tile>,
): Path<Tile> | undefined {
  const area = assert(areas.get(subject.areaId));
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
