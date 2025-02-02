import { type Vector } from "@mp/math";
import type { StateAccess } from "@mp/sync/server";
import { TRPCError } from "@trpc/server";
import { recordValues, type Tile } from "@mp/std";
import { auth } from "../../middlewares/auth";
import { schemaFor, t } from "../../trpc";
import { type WorldState } from "../world/WorldState";
import { moveTo } from "../../traits/movement";
import type { AreaLookup } from "../area/loadAreas";
import { type CharacterId } from "./schema";
import type { CharacterService } from "./service";

export interface CharacterRouterDependencies {
  state: StateAccess<WorldState>;
  areas: AreaLookup;
  characterService: CharacterService;
}

export type CharacterRouter = ReturnType<typeof createCharacterRouter>;
export function createCharacterRouter({
  state: accessState,
  areas,
  characterService,
}: CharacterRouterDependencies) {
  return t.router({
    move: t.procedure
      .input(schemaFor<{ characterId: CharacterId; to: Vector<Tile> }>())
      .use(auth())
      .mutation(({ input: { characterId, to }, ctx: { user } }) =>
        accessState(`world.move`, (state) => {
          const char = state.actors[characterId];

          if (!char || char.type !== "character") {
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

          const result = moveTo(char, areas, to);
          if (result.isErr()) {
            throw new TRPCError({ code: "BAD_REQUEST", message: result.error });
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
            recordValues(state.actors)
              .filter((actor) => actor.type === "character")
              .find((actor) => actor.userId === user.id),
        );

        if (existingCharacter) {
          return existingCharacter.id;
        }

        const char = await characterService.getOrCreateCharacterForUser(
          user.id,
        );
        accessState("world.join (initialize character)", (state) => {
          state.actors[char.id] = { type: "character", ...char };
        });
        return char.id;
      }),
  });
}
