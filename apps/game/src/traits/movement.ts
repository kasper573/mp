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

export interface MovementTrait {
  /**
   * Current position of the subject.
   */
  coords: Vector<Tile>;
  speed: Tile;
  areaId: AreaId;
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
  dir: CardinalDirection;
}

export function movementBehavior(
  state: GameState,
  areas: AreaLookup,
): TickEventHandler {
  return function movementBehaviorTick({ timeSinceLastTick }) {
    for (const actor of state.actors.values()) {
      // The dead don't move
      if (actor.health <= 0) {
        actor.path = undefined;
        actor.moveTarget = undefined;
        continue;
      }

      // Consume the move target and produce a new path to move along
      if (actor.moveTarget) {
        actor.path = findPathForSubject(actor, areas, actor.moveTarget);
        actor.moveTarget = undefined;
      }

      moveAlongPath(actor, timeSinceLastTick);

      // Process portals
      const area = assert(areas.get(actor.areaId));
      for (const object of area.hitTestObjects(
        area.tiled.tileCoordToWorld(actor.coords),
      )) {
        const destinationArea = areas.get(
          getAreaIdFromObject(object) as AreaId,
        );
        if (
          destinationArea &&
          actor.type === "character" &&
          actor.desiredPortalId === object.id
        ) {
          actor.path = undefined;
          actor.desiredPortalId = undefined;
          actor.areaId = destinationArea.id;
          actor.coords = destinationArea.start;
        }
      }
    }
  };
}

export function findPathForSubject(
  subject: MovementTrait & { id: unknown },
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
