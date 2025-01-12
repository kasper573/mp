import type { AreaId, AreaResource } from "@mp/data";
import { moveAlongPath } from "@mp/data";
import { vec_copy } from "@mp/math";
import type { StateAccess } from "@mp/sync/server";
import type { TickEventHandler } from "@mp/time";
import type { WorldState } from "../world/WorldState";

export function characterMoveBehavior(
  accessState: StateAccess<WorldState>,
  areas: Map<AreaId, AreaResource>,
): TickEventHandler {
  return (delta) => {
    accessState("characterMoveBehavior", (state) => {
      for (const char of Object.values(state.characters)) {
        if (char.path) {
          moveAlongPath(char.coords, char.path, char.speed, delta);
          if (!char.path?.length) {
            delete char.path;
          }
        }

        const area = areas.get(char.areaId);
        if (area) {
          for (const hit of area.hitTestObjects([char], (c) => c.coords)) {
            const targetArea = areas.get(
              hit.object.properties.get("goto")?.value as AreaId,
            );
            if (targetArea) {
              char.areaId = targetArea.id;
              char.coords = vec_copy(targetArea.start);
              delete char.path;
            }
          }
        }
      }
    });
  };
}
