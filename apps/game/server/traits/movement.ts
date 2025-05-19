import {
  nearestCardinalDirection,
  type CardinalDirection,
  type Path,
  type Vector,
} from "@mp/math";
import { TimeSpan, type TickEventHandler } from "@mp/time";
import { assert, type Tile } from "@mp/std";
import type { VectorGraphNodeId } from "@mp/path-finding";
import type { GameStateMachine } from "../game-state";
import type { AreaLookup } from "../area/lookup";
import type { AreaId } from "../../shared/area/area-id";
import { moveAlongPath } from "../../shared/area/move-along-path";
import type { ActorId } from "./actor";

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
   * The current path the subject is following.
   */
  path?: Path<Tile>;
  /**
   * The direction the subject is facing.
   */
  dir: CardinalDirection;
}

export function movementBehavior(
  state: GameStateMachine,
  areas: AreaLookup,
): TickEventHandler {
  const nextForcedPathFinds = new Map<ActorId, TimeSpan>();
  const forcedPathFindInterval = TimeSpan.fromSeconds(1 / 3);
  const tileNodeWeights: Map<VectorGraphNodeId, number> = new Map();

  for (const area of areas.values()) {
    area.graph.bindNodeWeightFn((node) => tileNodeWeights.get(node.id) ?? 0);
  }

  return ({ timeSinceLastTick, totalTimeElapsed }) => {
    // We need to make a first pass to set the weights for the path finding graph.
    // This helps promote more natural movement in avoiding walking over each other.
    tileNodeWeights.clear();
    for (const actor of state.actors.values()) {
      const area = assert(areas.get(actor.areaId));
      const node = area.graph.getNearestNode(actor.coords);
      if (node) {
        // A node occupied by an actor is weighted higher
        tileNodeWeights.set(node.id, 3); // 3 is more than walking around the tile (which is two diagonals, ~2.8)
      }
    }

    for (const actor of state.actors.values()) {
      // The dead don't move
      if (actor.health <= 0) {
        state.actors.update(actor.id, (update) => {
          update.add("path", undefined);
          update.add("moveTarget", undefined);
        });
        continue;
      }

      let { moveTarget } = actor;
      const area = assert(areas.get(actor.areaId));

      // We force refresh the path on an interval to avoid path finding every tick.
      // This gives us path up-to-date to a certain frequency.
      if (
        !moveTarget &&
        actor.path?.length &&
        totalTimeElapsed.compareTo(
          nextForcedPathFinds.get(actor.id) ?? TimeSpan.Zero,
        ) > 0
      ) {
        nextForcedPathFinds.set(
          actor.id,
          totalTimeElapsed.add(forcedPathFindInterval),
        );
        moveTarget = actor.path.at(-1);
      }

      if (moveTarget) {
        state.actors.update(actor.id, (update) =>
          update
            .add("path", findPathForSubject(actor, areas, moveTarget))
            .add("moveTarget", undefined),
        );
      }

      if (actor.path) {
        const [newCoords, newPath] = moveAlongPath(
          actor.coords,
          actor.path,
          actor.speed,
          timeSinceLastTick,
        );

        state.actors.update(actor.id, (update) => {
          update.add("coords", newCoords).add("path", newPath);
          if (newPath?.length) {
            const newDir = nearestCardinalDirection(
              newCoords.angle(newPath[0]),
            );
            if (newDir !== actor.dir) {
              update.add("dir", newDir);
            }
          }
        });
      }

      // Process portals
      for (const hit of area.hitTestObjects([actor], (c) => c.coords)) {
        const targetArea = areas.get(
          hit.object.properties.get("goto")?.value as AreaId,
        );
        if (targetArea) {
          state.actors.update(actor.id, (update) =>
            update
              .add("path", undefined)
              .add("areaId", targetArea.id)
              .add("coords", targetArea.start),
          );
        }
      }
    }

    // Use the til arrangement information to scatter npcs that are standing still on th same tile
    // for (const [node, groupedActorIds] of tileArrangedActors.entries()) {
    //   const actors = groupedActorIds
    //     .values()
    //     .map((id) => state.actors()[id])
    //     .filter(
    //       (actor) =>
    //         !actor.path && // Standing still
    //         actor.type === "npc",
    //     )
    //     .toArray();

    //   if (actors.length <= 1) {
    //     continue; // Not cluttered unless more than one npc is standing still on the same tile
    //   }

    //   const area = assert(areas.get(actors[0].areaId));
    //   const adjacentNodes = randomizeArray(area.graph.getLinkedNodes(node));

    //   // We only scatter as many npcs as there are adjacent nodes in one tick.
    //   // If there are more actors than nodes, the rest will stay put this tick.
    //   // This will eventually resolve in all actors being scattered.
    //   const max = Math.min(actors.length, adjacentNodes.length);
    //   for (let i = 0; i < max; i++) {
    //     const adjustment = adjacentNodes[i];
    //     state.actors.update(actors[i].id, (update) =>
    //       update.add("moveTarget", adjustment.data.vector),
    //     );
    //   }
    // }
  };
}

export function findPathForSubject(
  subject: MovementTrait & { id: unknown },
  areas: AreaLookup,
  dest: Vector<Tile>,
): Path<Tile> | undefined {
  const area = assert(areas.get(subject.areaId));
  const destNode = area.graph.getNearestNode(dest);
  if (!destNode) {
    return; // Destination not reachable (no closest node available)
  }

  // Find a new path from the current position
  const fromNode = assert(area.graph.getNearestNode(subject.coords));
  const newPath = area.findPath(fromNode.id, destNode.id);
  if (newPath) {
    return newPath;
  }

  // No path available between A and B
}
