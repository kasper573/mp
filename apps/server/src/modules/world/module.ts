import type { TimeSpan } from "@mp/time";
import {
  findPath,
  moveAlongPath,
  type AreaId,
  type AreaResource,
} from "@mp/data";
import { Vector } from "@mp/math";
import { t } from "../factory";
import { auth } from "../../middlewares/auth";
import type { CharacterId, WorldState } from "./schema";

export interface WorldModuleDependencies {
  state: WorldState;
  areas: Map<AreaId, AreaResource>;
  defaultAreaId: AreaId;
  characterKeepAliveTimeout?: TimeSpan;
}

export type WorldModule = ReturnType<typeof createWorldModule>;
export function createWorldModule({
  state,
  areas,
  defaultAreaId,
}: WorldModuleDependencies) {
  return t.module({
    tick: t.procedure
      .type("server-only")
      .input<TimeSpan>()
      .create(({ input: delta }) => {
        for (const char of state.characters.values()) {
          if (char.path) {
            const { destinationReached } = moveAlongPath(
              char.coords,
              char.path,
              char.speed,
              delta,
            );
            if (destinationReached) {
              char.path = undefined;
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
                char.coords = targetArea.start.copy();
                char.path = undefined;
              }
            }
          }
        }
      }),

    move: t.procedure
      .input<Vector>()
      .create(async ({ input: { x, y }, context }) => {
        const characterId = await auth(context);
        const char = state.characters.get(characterId);

        if (!char) {
          context.logger.error("Character not found", characterId);
          return;
        }

        const area = areas.get(char.areaId);
        if (!area) {
          context.logger.error("Area not found", char.areaId);
          return;
        }

        const idx = char.path?.findIndex((c) => c.x === x && c.y === y);
        if (idx !== undefined && idx !== -1) {
          char.path = char.path?.slice(0, idx + 1);
        } else {
          const newPath = findPath(char.coords, new Vector(x, y), area.dGraph);
          if (newPath) {
            char.path = newPath;
          }
        }
      }),

    join: t.procedure.output<CharacterId>().create(async ({ context }) => {
      const characterId = await auth(context);

      let player = state.characters.get(characterId);
      if (player === undefined) {
        context.logger.info("Character created", characterId);

        const area = areas.get(defaultAreaId);
        if (!area) {
          throw new Error(
            "Could not create character, default area not found: " +
              defaultAreaId,
          );
        }

        player = {
          areaId: area.id,
          coords: new Vector(0, 0),
          id: characterId,
          path: [],
          speed: 3,
        };
        player.coords = area.start.copy();
        state.characters.set(player.id, player);
      } else {
        context.logger.info("Character reclaimed", characterId);
      }

      return characterId;
    }),
  });
}
