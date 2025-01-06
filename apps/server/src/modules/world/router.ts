import type { Ticker } from "@mp/time";
import {
  findPath,
  moveAlongPath,
  type AreaId,
  type AreaResource,
} from "@mp/data";
import type { Vector } from "@mp/math";
import { vec, vec_copy } from "@mp/math";
import type { StateAccess } from "@mp/sync/server";
import { TRPCError } from "@trpc/server";
import { auth } from "../../middlewares/auth";
import { schemaFor, t } from "../../trpc";
import { type CharacterId, type WorldState } from "./schema";
import type { WorldService } from "./service";

export interface WorldRouterDependencies {
  state: StateAccess<WorldState>;
  service: WorldService;
  ticker: Ticker;
  areas: Map<AreaId, AreaResource>;
}

export type WorldRouter = ReturnType<typeof createWorldRouter>;
export function createWorldRouter({
  state: accessState,
  areas,
  ticker,
  service,
}: WorldRouterDependencies) {
  ticker.subscribe((delta) => {
    accessState("world.ticker", (state) => {
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
  });

  return t.router({
    move: t.procedure
      .input(schemaFor<{ characterId: CharacterId } & Vector>())
      .use(auth())
      .mutation(({ input: { characterId, x, y }, ctx: { user } }) =>
        accessState(`world.move`, (state) => {
          const char = state.characters[characterId];

          if (!char) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Character not found",
            });
          }

          if (char.userId !== user.id) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You don't have access to this character",
            });
          }

          const area = areas.get(char.areaId);
          if (!area) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Characters current area not found: ${char.areaId}`,
            });
          }

          const idx = char.path?.findIndex((c) => c.x === x && c.y === y);
          if (idx !== undefined && idx !== -1) {
            char.path?.splice(idx + 1);
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
      .mutation(async ({ ctx: { user } }) => {
        const char = await service.getOrCreateCharacterForUser(user.id);
        accessState("world.join", (state) => {
          state.characters[char.id] = char;
        });
        return char.id;
      }),
  });
}
