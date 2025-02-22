import type { Vector } from "@mp/math";
import type { PatchStateMachine } from "@mp/sync-server";
import { TRPCError } from "npm:@trpc/server";
import { recordValues, type Tile } from "@mp/std";
import { auth } from "../../middlewares/auth.ts";
import { schemaFor, t } from "../../trpc.ts";
import type { WorldState } from "../world/WorldState.ts";
import { moveTo } from "../../traits/movement.ts";
import type { AreaLookup } from "../area/loadAreas.ts";
import type { CharacterId } from "./schema.ts";
import type { CharacterService } from "./service.ts";

export interface CharacterRouterDependencies {
  state: PatchStateMachine<WorldState>;
  areas: AreaLookup;
  characterService: CharacterService;
}

export type CharacterRouter = ReturnType<typeof createCharacterRouter>;
export function createCharacterRouter({
  state,
  areas,
  characterService,
}: CharacterRouterDependencies) {
  return t.router({
    move: t.procedure
      .input(schemaFor<{ characterId: CharacterId; to: Vector<Tile> }>())
      .use(auth())
      .mutation(({ input: { characterId, to }, ctx: { user } }) => {
        const char = state.actors()[characterId];

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

        state.actors.update(char.id, { path: result.value.path });
      }),

    join: t.procedure
      .output(schemaFor<CharacterId>())
      .use(auth())
      .mutation(async ({ ctx: { user } }) => {
        const existingCharacter = recordValues(state.actors())
          .filter((actor) => actor.type === "character")
          .find((actor) => actor.userId === user.id);

        if (existingCharacter) {
          return existingCharacter.id;
        }

        const char = await characterService.getOrCreateCharacterForUser(
          user.id,
        );
        state.actors.set(char.id, { type: "character", ...char });
        return char.id;
      }),
  });
}
