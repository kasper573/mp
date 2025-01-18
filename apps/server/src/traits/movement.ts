import { findPath, moveAlongPath, type AreaId } from "@mp/data";
import type { Path, Vector } from "@mp/math";
import { vec, vec_copy } from "@mp/math";
import type { StateAccess } from "@mp/sync/server";
import type { TickEventHandler } from "@mp/time";
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
  areas: AreaLookup,
): TickEventHandler {
  return (delta) => {
    accessState("movementBehavior", (state) => {
      const subjects: MovementTrait[] = Object.values(state.characters);

      for (const subject of subjects) {
        if (subject.path) {
          moveAlongPath(subject.coords, subject.path, subject.speed, delta);
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
  { x, y }: Vector,
) {
  const area = areas.get(subject.areaId);
  if (!area) {
    throw new Error(`Area not found: ${subject.areaId}`);
  }

  const idx = subject.path?.findIndex((c) => c.x === x && c.y === y);
  if (idx !== undefined && idx !== -1) {
    subject.path?.splice(idx + 1);
  } else {
    const newPath = findPath(subject.coords, vec(x, y), area.dGraph);
    if (newPath) {
      subject.path = newPath;
    }
  }
}
