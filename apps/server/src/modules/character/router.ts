import { findPath, type AreaId, type AreaResource } from "@mp/data";
import type { Vector } from "@mp/math";
import { vec } from "@mp/math";
import type { StateAccess } from "@mp/sync/server";
import { TRPCError } from "@trpc/server";
import { auth } from "../../middlewares/auth";
import { schemaFor, t } from "../../trpc";
import { type WorldState } from "../../WorldState";
import { type CharacterId } from "./schema";
import type { CharacterService } from "./service";

export interface CharacterRouterDependencies {
  state: StateAccess<WorldState>;
  service: CharacterService;
  areas: Map<AreaId, AreaResource>;
}

export type CharacterRouter = ReturnType<typeof createCharacterRouter>;
export function createCharacterRouter({
  state: accessState,
  areas,
  service,
}: CharacterRouterDependencies) {
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
        const existingCharacter = accessState(
          "world.join (check existing character)",
          (state) =>
            Object.values(state.characters).find((c) => c.userId === user.id),
        );

        if (existingCharacter) {
          return existingCharacter.id;
        }

        const char = await service.getOrCreateCharacterForUser(user.id);
        accessState("world.join (initialize character)", (state) => {
          state.characters[char.id] = char;
        });
        return char.id;
      }),
  });
}
