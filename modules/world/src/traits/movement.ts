import { moveAlongPath, type AreaId } from "@mp-modules/area";
import type { Path, Vector } from "@mp/math";
import type { PatchStateMachine } from "@mp/sync/server";
import { type TickEventHandler } from "@mp/time";
import type { Tile } from "@mp/std";
import { recordValues } from "@mp/std";
import type { AreaLookup } from "@mp-modules/area/server";
import type { WorldState } from "../world/WorldState";

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
}

export function movementBehavior(
  state: PatchStateMachine<WorldState>,
  areas: AreaLookup,
): TickEventHandler {
  return ({ timeSinceLastTick }) => {
    for (const subject of recordValues(state.actors())) {
      if (subject.moveTarget) {
        state.actors.update(subject.id, {
          path: findPathForSubject(subject, areas, subject.moveTarget),
          moveTarget: undefined,
        });
      }

      if (subject.path) {
        const [newCoords, newPath] = moveAlongPath(
          subject.coords,
          subject.path,
          subject.speed,
          timeSinceLastTick,
        );
        state.actors.update(subject.id, {
          coords: newCoords,
          path: newPath.length > 0 ? newPath : undefined,
        });
      }

      const area = areas.get(subject.areaId);
      if (area) {
        for (const hit of area.hitTestObjects([subject], (c) => c.coords)) {
          const targetArea = areas.get(
            hit.object.properties.get("goto")?.value as AreaId,
          );
          if (targetArea) {
            state.actors.update(subject.id, {
              path: undefined,
              areaId: targetArea.id,
              coords: targetArea.start,
            });
          }
        }
      }
    }
  };
}

function findPathForSubject(
  subject: MovementTrait & { id: unknown },
  areas: AreaLookup,
  dest: Vector<Tile>,
): Path<Tile> | undefined {
  const area = areas.get(subject.areaId);
  if (!area) {
    return; // area not found
  }

  const destNode = area.graph.getNearestNode(dest);
  if (!destNode) {
    return; // Destination not reachable (no closest node available)
  }

  // If the subject is already on a path we can reuse that information for better path finding
  if (subject.path?.length) {
    // If the path contains the the destination we can simply truncate the path to that point
    const idx = subject.path.findIndex(
      (c) => c.x === destNode.data.vector.x && c.y === destNode.data.vector.y,
    );
    if (idx !== -1) {
      return subject.path.slice(0, idx); // Path truncated
    }

    // If the destination is new, we need to find a new path.
    // But since the subject is currently on a path, its current position is a good starting point since it's going to be on a fraction,
    // which doesn't directly resolve to a node in the path finding graph. We could use the nearest node,
    // but that could result in stuttering movement, so we will forcefully retain the next step in the current path
    // and find a new path to the next destination from there. This will result in a smoother movement.
    const nextNode = area.graph.getNearestNode(subject.path[0]);
    if (nextNode) {
      const newPath = area.findPath(nextNode.id, destNode.id);
      if (newPath) {
        return subject.path.slice(0, 1).concat(newPath); // Path extended
      }
    }
  }

  // Find a new path from the current position
  const fromNode = area.graph.getNearestNode(subject.coords);
  if (!fromNode) {
    throw new Error(
      `Invalid start position: ${subject.coords.x},${subject.coords.y}`,
    );
  }

  const newPath = area.findPath(fromNode.id, destNode.id);
  if (newPath) {
    return newPath;
  }

  // No path available between A and B
}
