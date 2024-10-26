import type { TimeSpan } from "@mp/time";
import {
  findPath,
  moveAlongPath,
  type AreaId,
  type AreaResource,
} from "@mp/data";
import type { Vector } from "@mp/math";
import { vec, vec_copy } from "@mp/math";
import type { StateAccess } from "@mp/network/server";
import { auth } from "../../middlewares/auth";
import { schemaFor, t } from "../../trpc";
import type { Ticker } from "../../Ticker";
import type { CharacterId, WorldState } from "./schema";

export interface WorldRouterDependencies {
  state: StateAccess<WorldState>;
  areas: Map<AreaId, AreaResource>;
  defaultAreaId: AreaId;
  characterKeepAliveTimeout?: TimeSpan;
  ticker: Ticker;
}

export type WorldRouter = ReturnType<typeof createWorldRouter>;
export function createWorldRouter({
  state: accessState,
  areas,
  defaultAreaId,
  ticker,
}: WorldRouterDependencies) {
  ticker.subscribe((delta) => {
    accessState((state) => {
      for (const char of Object.values(state.characters)) {
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
              char.coords = vec_copy(targetArea.start);
              char.path = undefined;
            }
          }
        }
      }
    });
  });

  return t.router({
    move: t.procedure
      .input(schemaFor<{ characterId: CharacterId } & Vector>())
      .use(auth())
      .mutation(({ input: { characterId, x, y }, ctx: { logger } }) =>
        accessState((state) => {
          const char = state.characters[characterId];

          if (!char) {
            logger.error("Character not found", characterId);
            return;
          }

          const area = areas.get(char.areaId);
          if (!area) {
            logger.error("Area not found", char.areaId);
            return;
          }

          const idx = char.path?.findIndex((c) => c.x === x && c.y === y);
          if (idx !== undefined && idx !== -1) {
            char.path = char.path?.slice(0, idx + 1);
          } else {
            const newPath = findPath(char.coords, vec(x, y), area.dGraph);
            if (newPath) {
              char.path = newPath;
            }
          }
        }),
      ),

    join: t.procedure
      .output(schemaFor<CharacterId>())
      .use(auth())
      .mutation(({ ctx: { userId, clients, logger } }) =>
        accessState((state) => {
          // TODO don't use user id as character id
          const characterId = userId as unknown as CharacterId;
          let player = state.characters[characterId];
          if (player === undefined) {
            logger.info("Character created", characterId);

            const area = areas.get(defaultAreaId);
            if (!area) {
              throw new Error(
                "Could not create character, default area not found: " +
                  defaultAreaId,
              );
            }

            clients.associateUserWithCharacter(userId, characterId);

            player = {
              areaId: area.id,
              coords: vec(0, 0),
              id: characterId,
              path: [],
              speed: 3,
            };
            player.coords = vec_copy(area.start);
            state.characters[player.id] = player;
          } else {
            logger.info("Character reclaimed", characterId);
          }

          return characterId;
        }),
      ),
  });
}
