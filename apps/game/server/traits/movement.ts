import type { Vector } from "@mp/math";
import { type CardinalDirection, type Path } from "@mp/math";
import { TimeSpan, type TickEventHandler } from "@mp/time";
import { assert, recordValues, type Tile } from "@mp/std";
import type { VectorGraphNodeId } from "@mp/path-finding";
import type { ObjectId } from "@mp/tiled-loader";
import type { GameState } from "../game-state";
import type { AreaLookup } from "../area/lookup";
import type { AreaId } from "../../shared/area/area-id";
import { moveAlongPath } from "../../shared/area/move-along-path";
import type { ActorId } from "../actor";
import { getAreaIdFromObject } from "../../shared/area/area-resource";

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
  const nextPathFinds = new Map<ActorId, TimeSpan>();
  const stalePathInterval = TimeSpan.fromSeconds(1 / 3);
  const tileNodeWeights: Map<VectorGraphNodeId, number> = new Map();

  for (const area of areas.values()) {
    area.graph.bindNodeWeightFn((node) => tileNodeWeights.get(node.id) ?? 0);
  }

  return ({ timeSinceLastTick, totalTimeElapsed }) => {
    // We need to make a first pass to set the weights for the path finding graph.
    // This helps promote more natural movement in avoiding walking over each other.
    tileNodeWeights.clear();
    for (const actor of recordValues(state.actors)) {
      const area = assert(areas.get(actor.areaId));
      const node = area.graph.getNearestNode(actor.coords);
      if (node) {
        // A node occupied by an actor is weighted higher
        tileNodeWeights.set(node.id, 3); // 3 is more than walking around the tile (which is two diagonals, ~2.8)
      }
    }

    for (const actor of recordValues(state.actors)) {
      // The dead don't move
      if (actor.health <= 0) {
        actor.path = undefined;
        actor.moveTarget = undefined;
        continue;
      }

      // Force refresh the path on an interval to avoid path finding every tick.
      // This gives us a good balance between correctness and performance.
      let { moveTarget } = actor;
      let pathIsStale =
        !moveTarget &&
        actor.path?.length &&
        totalTimeElapsed.compareTo(
          nextPathFinds.get(actor.id) ?? TimeSpan.Zero,
        ) > 0;

      // Patrolling npcs should never re-evaluate their paths since they're patrolling on a predetermined path
      if (actor.type === "npc" && actor.patrol) {
        pathIsStale = false;
      }

      if (pathIsStale && actor.path) {
        // Resetting the move target to the destination will effectively refresh the path
        moveTarget = actor.path.at(-1);
        nextPathFinds.set(actor.id, totalTimeElapsed.add(stalePathInterval));
      }

      // Consume the move target and produce a new path to move along
      if (moveTarget) {
        actor.path = findPathForSubject(actor, areas, moveTarget);
        actor.moveTarget = undefined;
      }

      if (actor.path) {
        const [newCoords, newPath] = moveAlongPath(
          actor.coords,
          actor.path,
          actor.speed,
          timeSinceLastTick,
        );

        actor.coords = newCoords;
        actor.path = newPath;
      }

      // Process portals
      const area = assert(areas.get(actor.areaId));
      for (const object of area.hitTestObjects([
        area.tiled.tileCoordToWorld(actor.coords),
      ])) {
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
  dest: Vector<Tile>,
): Path<Tile> | undefined {
  const area = assert(areas.get(subject.areaId));
  return area.findPathBetweenTiles(subject.coords, dest);
}
