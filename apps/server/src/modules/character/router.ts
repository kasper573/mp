import type { Vector } from "@mp/math";
import type { StateAccess } from "@mp/sync/server";
import { TRPCError } from "@trpc/server";
import { auth } from "../../middlewares/auth";
import { schemaFor, t } from "../../trpc";
import { type WorldState } from "../world/WorldState";
import { moveTo } from "../../traits/movement";
import { type CharacterId } from "./schema";
import type { CharacterService } from "./service";

export interface CharacterRouterDependencies {
  state: StateAccess<WorldState>;
  service: CharacterService;
}

export type CharacterRouter = ReturnType<typeof createCharacterRouter>;
export function createCharacterRouter({
  state: accessState,
  service,
}: CharacterRouterDependencies) {
  return t.router({
    move: t.procedure
      .input(schemaFor<{ characterId: CharacterId; to: Vector }>())
      .use(auth())
      .mutation(({ input: { characterId, to }, ctx: { user } }) =>
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

          moveTo(char, service.areas, to);
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
