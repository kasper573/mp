import { moveAlongPath, snapTileVector, type AreaId } from "@mp/data";
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

export function updatePathForSubject(
  subject: MovementTrait,
  areas: AreaLookup,
  dest: Vector,
) {
  const area = areas.get(subject.areaId);
  if (!area) {
    throw new Error(`Area not found: ${subject.areaId}`);
  }

  // Snap just in case the input is fractions
  dest = snapTileVector(dest);

  const idx = subject.path?.findIndex((c) => c.x === dest.x && c.y === dest.y);
  if (idx !== undefined && idx !== -1) {
    subject.path?.splice(idx + 1);
  } else {
    const newPath = area.findPath(subject.coords, dest);

    if (newPath) {
      subject.path = newPath;
    }
  }
}
