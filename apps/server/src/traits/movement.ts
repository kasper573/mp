import { moveAlongPath, type AreaId } from "@mp/data";
import type { Path, Vector } from "@mp/math";
import { vec_copy } from "@mp/math";
import type { StateAccess } from "@mp/sync/server";
import { type TickEventHandler } from "@mp/time";
import type { AreaLookup } from "../modules/area/loadAreas";
import type { WorldState } from "../package";

export interface MovementTrait {
  coords: Vector;
  speed: number;
  areaId: AreaId;
  path?: Path;
}

export function movementBehavior(
  accessState: StateAccess<WorldState>,
  getSubjects: (state: WorldState) => MovementTrait[],
  areas: AreaLookup,
): TickEventHandler {
  return ({ timeSinceLastTick }) => {
    accessState("movementBehavior", (state) => {
      for (const subject of getSubjects(state)) {
        if (subject.path) {
          moveAlongPath(
            subject.coords,
            subject.path,
            subject.speed,
            timeSinceLastTick,
          );
          if (!subject.path?.length) {
            delete subject.path;
          }
        }

        const area = areas.get(subject.areaId);
        if (area) {
          for (const hit of area.hitTestObjects([subject], (c) => c.coords)) {
            const targetArea = areas.get(
              hit.object.properties.get("goto")?.value as AreaId,
            );
            if (targetArea) {
              subject.areaId = targetArea.id;
              subject.coords = vec_copy(targetArea.start);
              delete subject.path;
            }
          }
        }
      }
    });
  };
}

/**
 * Update the path of the subject to the path required to reach the given destination.
 */
export function moveTo(
  subject: MovementTrait,
  areas: AreaLookup,
  dest: Vector,
) {
  const area = areas.get(subject.areaId);
  if (!area) {
    throw new Error(`Area not found: ${subject.areaId}`);
  }

  const destNode = area.graph.getNearestNode(dest);
  if (!destNode) {
    throw new Error(`Destination not reachable: ${dest.x},${dest.y}`);
  }

  // If the subject is already on a path that contains the the destination, truncate the path to that point
  if (subject.path) {
    const idx = subject.path.findIndex(
      (c) => c.x === destNode.data.vector.x && c.y === destNode.data.vector.y,
    );
    if (idx !== -1) {
      subject.path.splice(idx + 1);
      return;
    }
  }

  const fromNode = area.graph.getNearestNode(subject.coords);
  if (!fromNode) {
    throw new Error(
      `Invalid start position: ${subject.coords.x},${subject.coords.y}`,
    );
  }

  // Otherwise, find a new path to the destination
  subject.path = area.findPath(fromNode.id, destNode.id);
}
